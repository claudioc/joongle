import Database from 'better-sqlite3';
import type { ConfigEnv, PageModel, PageTitle, SearchResult } from '~/../types';
import { MAX_INDEXABLE_DOCUMENTS } from '~/constants';
import {
  compressTextForSearch,
  ensurePathExists,
  highlightPhrase,
  prepareFTSQuery,
} from '~/lib/helpers';
import type { DbService } from './dbService';

interface SearchRow {
  id: string;
  title_highlighted: string | null; // SQLite might return null
  content_snippet: string | null; // SQLite might return null
  slug: string;
}

export class SearchService {
  private static instance: SearchService | null = null;
  private db: Database.Database;
  private indexBuilt: Promise<void>;
  private resolveIndexBuilt!: () => void;
  private statements!: {
    update: Database.Statement;
    delete: Database.Statement;
    search: Database.Statement;
    searchTitle: Database.Statement;
  };
  // biome-ignore lint/suspicious/noExplicitAny:
  private changeListener: PouchDB.Core.Changes<any> | null = null;

  private constructor(
    private dbs: DbService,
    private config: ConfigEnv
  ) {
    this.indexBuilt = new Promise((resolve) => {
      this.resolveIndexBuilt = resolve;
    });

    try {
      this.db = new Database(
        `${this.config.DB_LOCAL_PATH ?? '.'}/fts_index.db`,
        {
          // verbose: console.log // Uncomment for SQL debugging
        }
      );

      // Create FTS5 virtual table if it doesn't exist
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
          id UNINDEXED,   -- Document ID, not searched
          title,          -- Indexed title field
          content,        -- Indexed content field
          slug UNINDEXED, -- URL slug, not searched
          title_full UNINDEXED,  -- Indexed title field with stopwords
          tokenize='porter unicode61 remove_diacritics 2'
        );
      `);

      this.prepareStatements();

      if (this.config.NODE_ENV !== 'test') {
        // Always rebuild the index in production, as the server bootstraps
        this.buildIndex(this.config.NODE_ENV === 'production');
        this.setupChangeListener();
      }
    } catch (err) {
      console.error('Failed to initialize SQLite database:', err);
      throw err;
    }
  }

  private setupChangeListener() {
    this.changeListener = this.dbs.db
      .changes({
        since: 'now',
        live: true,
        include_docs: true,
      })
      .on('change', async (change) => {
        if (change?.doc?.type === 'page') {
          // We cannot really distinguish between inserts and updates
          // See also https://pouchdb.com/guides/changes.html
          if (change.deleted) {
            await this.removeDocument(change.id);
          } else {
            await this.updateDocument(change.doc);
          }
        }
      })
      .on('error', (err) => {
        console.error('Error in changes feed:', err);
        // Maybe try to reconnect after a delay
        setTimeout(() => this.setupChangeListener(), 5000);
      });
  }

  private prepareStatements() {
    this.statements = {
      update: this.db.prepare(
        'INSERT OR REPLACE INTO pages_fts(id, title, content, slug, title_full) VALUES (?, ?, ?, ?, ?)'
      ),
      delete: this.db.prepare('DELETE FROM pages_fts WHERE id = ?'),
      search: this.db.prepare(`
        SELECT
          id,
          title_full,
          snippet(pages_fts, 2, '<mark>', '</mark>', '…', 64) as content_snippet,
          slug
        FROM pages_fts
        WHERE pages_fts MATCH ?
        ORDER BY bm25(pages_fts, 10, 5)
        LIMIT 50
      `),
      searchTitle: this.db.prepare(`
        SELECT
          id,
          title_full
        FROM pages_fts
        WHERE title MATCH ?
        ORDER BY bm25(pages_fts, 10, 0)
        LIMIT 25
      `),
    };
  }

  public static async getInstance(
    dbs?: DbService,
    config?: ConfigEnv
  ): Promise<SearchService> {
    if (!SearchService.instance && !dbs && !config) {
      throw new Error(
        'Cannot create an indexer instance without the database service and the config'
      );
    }

    if (!SearchService.instance && dbs && config) {
      await ensurePathExists(config.DB_LOCAL_PATH, 'database directory');
      SearchService.instance = new SearchService(dbs, config);
      await SearchService.instance.indexBuilt;
      return SearchService.instance;
    }

    if (!SearchService.instance) {
      throw new Error('Unexpected missed searchService instance');
    }

    return SearchService.instance;
  }

  public async buildIndex(forced = false) {
    try {
      if (!forced) {
        const nPage = (await this.dbs.countPages()).match(
          (count) => count,
          (_) => 0
        );
        const nIndexed = this.db
          .prepare('SELECT COUNT(*) as count FROM pages_fts')
          .get() as { count: number };

        if (nPage === nIndexed.count) {
          console.log(`🔍 Search index is up to date with ${nPage} documents`);
          this.resolveIndexBuilt();
          return;
        }
      }

      const allDocs = (
        await this.dbs.db.find({
          selector: { type: 'page' },
          limit: MAX_INDEXABLE_DOCUMENTS,
        })
      ).docs as PageModel[];

      // Create insert transaction for better performance
      const insertDocs = this.db.transaction((docs: PageModel[]) => {
        this.db.prepare('DELETE FROM pages_fts').run();

        // Insert all documents
        for (const doc of docs) {
          this.statements.update.run(
            doc._id,
            compressTextForSearch(doc.pageTitle),
            compressTextForSearch(doc.pageContent),
            doc.pageSlug,
            doc.pageTitle
          );
        }
      });

      // Run the transaction
      insertDocs(allDocs);

      console.log(`🔍 SQLite FTS index built with ${allDocs.length} documents`);
      this.resolveIndexBuilt();
    } catch (err) {
      console.error('Failed to build index:', err);
      throw err;
    }
  }

  public async removeDocument(id: string): Promise<void> {
    await this.indexBuilt;
    this.statements.delete.run(id);
  }

  public async updateDocument(doc: PageModel): Promise<void> {
    await this.indexBuilt;
    this.statements.update.run(
      doc._id,
      compressTextForSearch(doc.pageTitle),
      compressTextForSearch(doc.pageContent),
      doc.pageSlug,
      doc.pageTitle
    );
  }

  public async search(q: string): Promise<SearchResult[]> {
    await this.indexBuilt;

    const query = prepareFTSQuery(q);

    if (query === '') {
      return [];
    }

    try {
      // Booleans are only considered when uppercase, so this is what we do
      const rows = this.statements.search.all(query) as SearchRow[];
      const searchResults: SearchResult[] = [];

      for (const row of rows) {
        const page = (await this.dbs.getPageById(row.id)).match(
          (page) => page,
          (feedback) => {
            throw new Error(feedback.message);
          }
        );

        if (!page) continue;

        searchResults.push({
          pageId: row.id,
          pageSlug: row.slug,
          title: highlightPhrase(q, page.pageTitle),
          snippets: row.content_snippet || '',
        });
      }

      return searchResults;
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  public async searchByTitle(q: string): Promise<PageTitle[]> {
    await this.indexBuilt;

    const query = prepareFTSQuery(q);

    if (query === '') {
      return [];
    }

    try {
      const rows = this.statements.searchTitle.all(query) as {
        id: string;
        title_full: string;
      }[];

      return rows
        .filter((row) => row.title_full !== null)
        .map((row) => ({
          pageId: row.id,
          pageTitle: row.title_full,
        }));
    } catch (error) {
      console.error('Title search error:', error);
      return [];
    }
  }

  public close(): void {
    if (this.changeListener) {
      this.changeListener.cancel();
      this.changeListener = null;
    }
    if (this.db) {
      this.db.close();
    }
  }
}
