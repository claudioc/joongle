import type { PageModel } from '~/types';
import { DocumentIcon } from '../icons/DocumentIcon';
import styles from './TitlesList.module.css';
import { useApp } from '~/lib/context/App';
import type Polyglot from 'node-polyglot';

interface TitlesListProps {
  results: PageModel[];
  // We receive the i18n object because we can't use the useApp hook here
  i18n: Polyglot;
}

export const TitlesList = ({ results, i18n }: TitlesListProps) => {
  return (
    <>
      {results.length > 0 &&
        results.map((page) => (
          <li key={page._id}>
            <div class={styles.item}>
              <DocumentIcon />
              <a
                href={`#${page._id}`}
                data-page-id={page._id}
                data-page-title={page.pageTitle}
              >
                {page.pageTitle}
              </a>
            </div>
          </li>
        ))}
      {results.length === 0 && (
        <li class={styles.noResults}>
          <em>{i18n.t('MovePage.noResults')}</em>
        </li>
      )}
    </>
  );
};