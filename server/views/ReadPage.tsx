import { Layout } from './Layout';
import type { PageModel, WithApp } from '~/../types';
import { formatDate, isSameTimestamp } from '~/lib/helpers';
import { PageMenu } from './components/PageMenu';
import { PageBody } from './components/PageBody';
import { MainContent } from './components/MainContent';

export interface ReadPageProps extends WithApp {
  page?: PageModel;
  // There are no pages in the database so we show a nicer welcome page
  isWelcome?: boolean;
  // Whether to show the full page or just the body
  isFull?: boolean;
  // Whether we are showing the landing page or not
  isLandingPage?: boolean;
}

type PageModelPartial = Pick<PageModel, 'pageTitle' | 'pageContent'>;

const welcomePage: PageModelPartial = {
  pageTitle: '', // Handled by translations
  pageContent: '', // Handled by translations
};

export const ReadPage = ({
  app,
  page,
  isFull = true,
  isWelcome = false,
  isLandingPage = false,
}: ReadPageProps) => {
  const { i18n } = app;

  // We may receive an undefined page if we want to show the welcome page
  // or we still don't have a landing page
  const showPage = page && !isWelcome;
  if (!showPage) {
    welcomePage.pageContent = welcomePage.pageContent = i18n.t(
      'WelcomePage.content',
      {
        buttonLabel: i18n.t('Navigation.createTopPage'),
      }
    );
    welcomePage.pageTitle = i18n.t('WelcomePage.title');
  }

  const actualPage = showPage ? page : welcomePage;

  const content = (
    <div
      // These classes are referenced in tests
      class={[
        isWelcome && 'is-welcome',
        showPage && 'is-page',
        isLandingPage && 'is-landing',
      ]}
      data-page-id={page?._id}
    >
      {showPage && (
        <div class="level level-right has-text-grey is-size-7 page-actions is-flex-direction-row">
          {i18n.t('ReadPage.createdOn')} {formatDate(page.createdAt)}
          {!isSameTimestamp(page.updatedAt, page.createdAt) &&
            ` (${formatDate(page.updatedAt)})`}
          <PageMenu app={app} page={page} />
        </div>
      )}
      <MainContent>
        <PageBody title={actualPage.pageTitle} body={actualPage.pageContent} />
      </MainContent>
    </div>
  );

  return isFull ? (
    <Layout
      app={app}
      context="viewing page"
      title={actualPage.pageTitle}
      page={showPage ? page : undefined}
      isLandingPage={isLandingPage}
    >
      {content}
    </Layout>
  ) : (
    content
  );
};
