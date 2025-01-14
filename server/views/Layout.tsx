import { getBundleFilename, cssFile } from '~/lib/assets';
import { Feedback } from './components/Feedback';
import { Search } from './components/Search';
import { getFeedbackByCode } from '~/lib/feedbacks';
import styles from './Layout.module.css';
import type { PageModel, Context, WithApp } from '~/../types';
import { CogIcon } from './icons/CogIcon';
import type { FastifyInstance } from 'fastify';

interface LayoutProps extends WithApp {
  app: FastifyInstance;
  title: string;
  page?: PageModel | null;
  children: string | JSX.Element[] | JSX.Element;
  context?: Context;
  isLandingPage?: boolean;
  withEditor?: boolean;
  withCreateButton?: boolean;
}

export const Layout = ({
  app,
  title,
  page,
  children,
  context = 'none',
  isLandingPage = false,
  withEditor = false,
  withCreateButton = true,
}: LayoutProps) => {
  const { feedbackCode, i18n, settings } = app;
  const onKeypress = {
    '@keyup.escape': '$store.has.none()',
  };

  const createButtonLink =
    isLandingPage || !page ? '/create' : `/create/${page._id}`;

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>Joongle - {title}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="description" content="Joongle is the ultimate CMS" />
        {withEditor && <meta http-equiv="Cache-Control" content="no-store" />}
        <link rel="stylesheet" href={cssFile} />
        <script src="/a/vendor/htmx.min.js" />
        <script src="/a/vendor/Sortable.min.js" />
      </head>
      <body x-data="" {...onKeypress}>
        <script src={getBundleFilename('app')} />
        {withEditor && <script src={getBundleFilename('editor')} />}
        {process.env.NODE_ENV === 'development' && (
          <script>App.livereload();</script>
        )}

        {/* We use the context to identify what we are doing, like 'editing page' for example; useful for CSS or JS targeting */}
        <main class="columns mt-0 ml-0" data-context={context}>
          {/* "main > div" is referenced in App.ts */}
          <div
            class={[
              styles.mainLeft,
              'column',
              'is-narrow',
              'has-background-info-dark',
            ]}
          >
            <header class={[styles.header, 'block']}>
              <div class="block">
                <div class="level is-flex-direction-row">
                  <div class={[styles.title, 'is-size-5', 'level-left']}>
                    <a href="/" class="has-text-warning">
                      {settings.siteTitle}
                    </a>
                  </div>
                  <div class="level-right is-flex-direction-row">
                    <a
                      href="/settings"
                      aria-label={i18n.t('Navigation.editSettings')}
                      class=" has-text-grey-lighter"
                    >
                      <CogIcon />
                    </a>
                  </div>
                </div>
              </div>
              <div class="block">
                <Search app={app} />
              </div>
            </header>

            {withCreateButton && (
              <div class="block">
                {/* The href and text is dynamically updated by our htmx extension */}
                <a
                  class="button"
                  href={createButtonLink}
                  data-labelNested={i18n.t('Navigation.createNestedPage')}
                >
                  {isLandingPage
                    ? i18n.t('Navigation.createTopPage')
                    : i18n.t('Navigation.createNestedPage')}
                </a>
              </div>
            )}
            <aside
              class={[styles.aside, 'block']}
              hx-get={`/parts/nav/${page ? page._id : ''}`}
              hx-trigger="load once"
            >
              <div class="skeleton-lines">
                <div />
                <div />
                <div />
                <div />
                <div />
              </div>
            </aside>
          </div>

          <div class={[styles.mainRight, 'column', 'p-3', 'pr-5']}>
            <button
              type="button"
              class={[
                styles.burgerToggle,
                'navbar-burger',
                'level',
                'level-right',
              ]}
              aria-label="menu"
              aria-expanded="false"
            >
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span aria-hidden="true" />
            </button>
            <div x-show="$store.has.some()">
              <Feedback app={app} feedback={getFeedbackByCode(feedbackCode)} />
            </div>
            {/* #main-page-body is used as a hx-target */}
            <div id="main-page-body">{children}</div>
          </div>
        </main>
      </body>
    </html>
  );
};
