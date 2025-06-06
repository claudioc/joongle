import { joinPaths } from './helpers';

const htmx = window.htmx;
let controller: AbortController;
// FIXME bad idea but we need to know if an error occurred since htmx
// doesn't persist this information
let htmxAjaxFailed = false;
// FIXME we need this from the headers to update the global page title
// but the 'validate' extension doesn't have access to the headers
let lastPageTitle = '';

const updateCreateButton = (pageId = '') => {
  if (!pageId) {
    return;
  }

  const createButton = document.querySelector(
    '[data-ref="create-page-button"]'
  ) as HTMLElement;

  if (createButton) {
    createButton.setAttribute(
      'href',
      joinPaths(BXD_BASE_PATH, `/pages/create?parentPageId=${pageId}`)
    );
    // As we are moving away from the landing page, the button label must be updated accordingly
    createButton.textContent = createButton.dataset.labelnested ?? '';
  }
};

const navigationHandlers = (_event: PageTransitionEvent) => {
  // Clean up old controller if it exists
  if (controller) {
    controller.abort();
  }

  controller = new AbortController();

  window.addEventListener(
    'popstate',
    () => {
      // FIXME this is a tragic way to just remove the active class
      // to the navigation menu when the user uses back/forward.
      setTimeout(() => {
        // The document currently displayed
        const page = document.querySelector(
          '[data-ref="main-page-body"] [data-page-id]'
        ) as HTMLElement;
        if (!page) {
          return;
        }

        // The document currently highlighted in the navigation
        const active = document.querySelector(
          '[data-ref="main-navigation-tree"] .j-active'
        ) as HTMLElement;

        const pageId = page.dataset?.pageId;
        if (active && active.dataset.pageId !== pageId) {
          active.classList.remove('j-active');
        }

        const nextActive = document.querySelector(
          `[data-ref="main-navigation-tree"] [data-page-id="${pageId}"]`
        );

        if (nextActive) {
          nextActive.classList.add('j-active');
        }

        updateCreateButton(pageId);
      }, 200);
    },
    { signal: controller.signal }
  );

  // We intercept all the errors in here since a connection error won't trigger the htmx:responseError event
  document.body.addEventListener(
    'htmx:afterRequest',
    (event) => {
      // biome-ignore lint/suspicious/noExplicitAny:
      const detail = (event as any).detail;
      if (!detail || !detail.xhr) {
        return;
      }

      htmxAjaxFailed = true;
      lastPageTitle = detail.xhr.getResponseHeader('x-page-title') ?? '';

      if (detail.xhr.status === 404) {
        alert('Page not found');
        return;
      }

      if (detail.xhr.status >= 500) {
        alert('An error occurred while loading the page. Please try again.');
        return;
      }

      if (detail.xhr.status === 0) {
        alert('Cannot establish a connection with the server.');
        return;
      }

      htmxAjaxFailed = false;
      // All good!
    },
    { signal: controller.signal }
  );
};

const setupHtmx = () => {
  // A set of actions to be taken when a new page has been loaded
  htmx.defineExtension('activate', {
    onEvent: (name: string, evt: Event) => {
      const el = evt.target as HTMLElement;
      if (!el || name !== 'htmx:xhr:loadend') {
        return;
      }

      if (htmxAjaxFailed) {
        return;
      }

      // FIXME this is a "make it works" solution but all the actions below should be handled
      // by a change the Alpine store

      // Activate the current page in the nav
      const [navElement, activeClass] = (el.dataset.activate ?? '').split('/');
      if (navElement && activeClass) {
        el.closest(navElement)
          ?.querySelectorAll(`.${activeClass}`)
          .forEach((el) => el.classList.remove(activeClass));

        el.classList.add(activeClass);
      }

      // Update the main context
      const context = el.dataset.context;
      if (context) {
        const el = document.querySelector('main');
        if (el) {
          el.dataset.context = context;
        }
      }

      // Update the create button's href (the very first value is set in the Layout.tsx file)
      updateCreateButton(el.dataset.pageId);

      // Rebind sortable to the closest UL
      window.App.enableSortable(el.closest('ul'));

      const titleEl = document.querySelector(
        'title[data-site-title]'
      ) as HTMLTitleElement;

      if (titleEl) {
        // Update the page title
        window.App.setPageTitle(
          titleEl.dataset.siteTitle ?? '',
          lastPageTitle,
          titleEl.dataset.titlePattern ?? ''
        );
      }
    },
  });

  // Tricky stuff: we want HTMX to not intercept the click on the
  // navigation items when we use the ctrl or meta keys to open it
  // in a new tab; instead of trying to cancel things after HTMX has
  // started processing, we need to intercept the original click event
  // before HTMX fully handles it, and only stop it from reaching HTMX
  // if the modifier keys are pressed.

  document.addEventListener('DOMContentLoaded', () => {
    const nav = document.getElementById('js-mainNav') as HTMLElement;

    if (!nav) {
      return;
    }

    nav.addEventListener(
      'click',
      (event: MouseEvent) => {
        const targetElement = event.target as Element;
        const linkElement = targetElement.closest('a[hx-get]');
        if (!linkElement) {
          return;
        }

        if (event.ctrlKey || event.metaKey) {
          event.stopPropagation();
          return;
        }
      },
      true
    );
  });

  window.removeEventListener('pageshow', navigationHandlers);
  window.addEventListener('pageshow', navigationHandlers);
};

if (htmx) {
  setupHtmx();
}
