import type {
  SettingsModel,
  PageModel,
  SessionModel,
  UserModel,
  PageSelector,
  ModelName,
  NavItem,
  PageRevInfo,
  PageModelWithRev,
  NodeEnv,
  ConfigEnv,
  FileModel,
  FileAttachmentModel,
  MagicModel,
  DbName,
} from '~/../types';
import { DEFAULT_TEXT_SIZE } from '~/../types';
import { Feedbacks } from '~/lib/feedbacks';
import { ErrorWithFeedback } from '~/lib/errors';
import slugify from 'slugify';
import nano, {
  type DocumentInsertResponse,
  type DocumentScope,
  type ServerScope,
} from 'nano';
import {
  slugUrl,
  getDefaultLanguage,
  extractFileRefsFrom,
  ensureValidLanguage,
} from '~/lib/helpers';
import sanitizeHtml from 'sanitize-html';
import { createId } from '@paralleldrive/cuid2';
import { POSITION_GAP_SIZE } from '~/constants';

interface DbServiceInitParams {
  serverUrl: string;
  username: string;
  password: string;
  env: NodeEnv;
}

let isTestRun = false;

const dbn = (name: DbName) => {
  return isTestRun ? `${name}-test` : name;
};

// https://github.com/apostrophecms/sanitize-html
const safeHtml = (str: string) =>
  sanitizeHtml(str, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img']),
    allowedAttributes: {
      a: ['href', 'rel', 'target'],
      img: [
        'src',
        'srcset',
        'alt',
        'title',
        'width',
        'height',
        'loading',
        'class',
        'style',
        // Used by tiptap Image extension
        'data-alignment',
      ],
    },
  });

const safeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export type { ServerScope as DbClient };

export function dbService(client?: nano.ServerScope) {
  if (!client) throw new ErrorWithFeedback(Feedbacks.E_MISSING_DB);

  const pagesDb: DocumentScope<PageModel> = client.db.use(dbn('pages'));
  if (!pagesDb) throw new ErrorWithFeedback(Feedbacks.E_MISSING_PAGES_DB);

  const settingsDb: DocumentScope<SettingsModel> = client.db.use(
    dbn('settings')
  );
  if (!settingsDb) throw new ErrorWithFeedback(Feedbacks.E_MISSING_SETTINGS_DB);

  const filesDb: DocumentScope<FileModel> = client.db.use(dbn('files'));
  if (!filesDb) throw new ErrorWithFeedback(Feedbacks.E_MISSING_FILES_DB);

  const magicsDb: DocumentScope<MagicModel> = client.db.use(dbn('magics'));
  if (!magicsDb) throw new ErrorWithFeedback(Feedbacks.E_MISSING_MAGICS_DB);

  const sessionDb: DocumentScope<SessionModel> = client.db.use(dbn('sessions'));
  if (!sessionDb) throw new ErrorWithFeedback(Feedbacks.E_MISSING_SESSIONS_DB);

  const userDb: DocumentScope<UserModel> = client.db.use(dbn('users'));
  if (!userDb) throw new ErrorWithFeedback(Feedbacks.E_MISSING_USERS_DB);

  return {
    getPageDb() {
      return pagesDb;
    },

    async getSettings(config?: ConfigEnv) {
      let settings: SettingsModel | null = null;
      try {
        settings = await settingsDb.get('settings');
      } catch (err: unknown) {
        if ((err as { statusCode?: number })?.statusCode !== 404) {
          throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
        }
      }

      // If settings are not found, create a new one using the default values from the config (.env)
      if (!settings) {
        const newSettings: SettingsModel = {
          _id: 'settings',
          landingPageId: null,
          siteTitle: config ? (config.SETTINGS_TITLE ?? '') : '',
          siteDescription: config ? (config.SETTINGS_DESCRIPTION ?? '') : '',
          siteLang: getDefaultLanguage(config),
          textSize: config ? config?.SETTINGS_TEXT_SIZE : DEFAULT_TEXT_SIZE,
        };

        await settingsDb.insert(newSettings);
        return newSettings;
      }

      // Adds the future attributes
      if (!settings.textSize) {
        settings.textSize = DEFAULT_TEXT_SIZE;
      }

      return settings;
    },

    async updateSettings(settings: SettingsModel) {
      settings.siteLang = ensureValidLanguage(settings.siteLang);

      try {
        await settingsDb.insert(settings);
      } catch (err) {
        console.log(err);
        throw new ErrorWithFeedback(Feedbacks.E_UPDATING_SETTINGS);
      }
    },

    async countPages(): Promise<number> {
      try {
        const result = await pagesDb.view('pages', 'count', { reduce: true });

        // Check if we have results and a valid value
        if (result?.rows?.[0]?.value != null) {
          return Number(result.rows[0].value);
        }

        return 0; // Default if no results or invalid structure
      } catch (error) {
        console.error('Error counting pages:', error);
        return 0; // Default on error
      }
    },

    async getPageById(pageId: string): Promise<PageModel | null> {
      let page: PageModel | null = null;
      try {
        page = await pagesDb.get(pageId);
      } catch (err: unknown) {
        if ((err as { statusCode?: number })?.statusCode !== 404) {
          throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
        }
      }

      return page;
    },

    async getPageBySlug(slug: string) {
      const result = await pagesDb.find({
        selector: { pageSlug: slug } as PageSelector,
        limit: 1,
      });

      return result.docs.length > 0 ? result.docs[0] : null;
    },

    async lookupPageBySlug(slug: string) {
      const result = await pagesDb.find({
        selector: {
          pageSlugs: {
            $in: [slug],
          },
        } as PageSelector,
        limit: 1,
      });

      return result.docs.length > 0 ? result.docs[0] : null;
    },

    async generateUniqueSlug(title: string) {
      let slug = slugify(title.trim(), { lower: true });
      let uniqueSlugFound = false;
      let counter = 1;

      while (!uniqueSlugFound) {
        const result = await pagesDb.find({
          selector: {
            $or: [{ pageSlug: slug }, { pageSlugs: { $in: [slug] } }],
          } as PageSelector,
          limit: 1,
        });

        const slugAlreadyInUse = result.docs.length > 0;

        if (slugAlreadyInUse) {
          slug = `${slugify(title.trim(), { lower: true })}-${counter++}`;
        } else {
          uniqueSlugFound = true;
        }
      }

      return slug;
    },

    // Helper to get siblings of a page sorted by position
    async getSiblingPages(parentId: string) {
      const result = await pagesDb.view('pages', 'by_parent_position', {
        startkey: [parentId],
        endkey: [parentId, {}],
        include_docs: true,
      });

      return result.rows.map((row) => row.doc);
    },

    // Find the appropriate position for inserting a page
    async findInsertPosition(
      parentId: string | null,
      targetIndex = Number.POSITIVE_INFINITY,
      pageId?: string
    ): Promise<number> {
      const siblings = await pagesDb.view('pages', 'by_parent_position', {
        startkey: [parentId],
        endkey: [parentId, {}],
        include_docs: true,
      });
      let pages = siblings.rows.map((row) => row.doc) as PageModel[];
      if (pageId) {
        pages = pages.filter((page) => page._id !== pageId);
      }

      // No siblings - first page
      if (pages.length === 0) {
        return POSITION_GAP_SIZE;
      }

      // Append at end
      if (targetIndex >= pages.length) {
        return pages[pages.length - 1].position + POSITION_GAP_SIZE;
      }

      // Insert at beginning
      if (targetIndex === 0) {
        return pages[0].position / 2;
      }

      // Insert between pages
      const prevPosition = pages[targetIndex - 1].position;
      const nextPosition = pages[targetIndex].position;
      return (prevPosition + nextPosition) / 2;
    },

    async insertPage(page: PageModel) {
      page.pageContent = safeHtml(page.pageContent);
      page.pageTitle = safeHtml(page.pageTitle);
      page.contentUpdated = true;

      try {
        await pagesDb.insert(page);
      } catch (error) {
        console.log(error);
        throw new ErrorWithFeedback(Feedbacks.E_CREATING_PAGE);
      }
    },

    async createSession(session: SessionModel) {
      try {
        await sessionDb.insert(session);
      } catch (error) {
        console.log(error);
        throw new ErrorWithFeedback(Feedbacks.E_CREATING_SESSION);
      }
    },

    async getSessionById(sessionId: string): Promise<SessionModel | null> {
      let session: SessionModel | null = null;
      try {
        session = await sessionDb.get(sessionId);
      } catch (error: unknown) {
        if ((error as { statusCode?: number })?.statusCode !== 404) {
          throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
        }
      }

      return session;
    },

    async deleteSession(sessionId: string): Promise<void> {
      const session = await this.getSessionById(sessionId);
      if (!session) {
        return;
      }

      try {
        await sessionDb.destroy(sessionId, session._rev ?? '');
      } catch (error) {
        // If session doesn't exist (404) just ignore
        if ((error as { statusCode?: number })?.statusCode !== 404) {
          throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
        }
      }
    },

    async search(q: string) {
      const query = safeRegExp(q);

      const result = await pagesDb.find({
        selector: {
          pageTitle: {
            $regex: `(?i)${query}`,
          },
        },
        limit: 25,
      });

      return result.docs;
    },

    // Couchdb doesn't support full-text search without Lucene
    async searchText(q: string) {
      const query = safeRegExp(q);

      const result = await pagesDb.find({
        selector: {
          $or: [
            {
              pageTitle: {
                $regex: `(?i)${query}`,
              },
            },
            {
              pageContent: {
                $regex: `(?i)${query}`,
              },
            },
          ],
        },
        limit: 25,
      });

      return result.docs;
    },

    async getTopLevelPages(): Promise<PageModel[]> {
      const result = await pagesDb.find({
        selector: {
          parentId: null,
        } as PageSelector,
        sort: [{ position: 'asc' }],
      });

      return result.docs;
    },

    async buildMenuTree(parentId: string | null): Promise<NavItem[]> {
      const result = await pagesDb.find({
        selector: {
          parentId: parentId ?? { $eq: null },
          position: { $gte: 0 },
        },
        fields: ['_id', 'pageTitle', 'pageSlug', 'position'],
        sort: [{ position: 'asc' }],
      });

      const menuTree = await Promise.all(
        result.docs.map(async (page) => {
          const menuItem: NavItem = {
            pageId: page._id,
            title: page.pageTitle,
            link: slugUrl(page.pageSlug),
            position: page.position,
            children: await this.buildMenuTree(page._id),
          };

          return menuItem;
        })
      );
      return menuTree;
    },

    async updatePageContent(page: PageModel, newPage: Partial<PageModel>) {
      const updatedPage: PageModel = {
        ...page,
        ...newPage,
        contentUpdated: true,
        pageTitle: safeHtml(newPage.pageTitle ?? ''),
        pageContent: safeHtml(newPage.pageContent ?? ''),
        updatedAt: newPage.updatedAt ?? new Date().toISOString(),
      };

      if (page.pageSlug !== newPage.pageSlug) {
        updatedPage.pageSlugs = [...page.pageSlugs, page.pageSlug];
      }

      try {
        await pagesDb.insert(updatedPage);
      } catch {
        throw new ErrorWithFeedback(Feedbacks.E_UPDATING_PAGE);
      }
    },

    async changePageParent(
      page: PageModel,
      newParentId: string | null,
      position: number
    ) {
      const updatedPage: PageModel = {
        ...page,
        position,
        contentUpdated: false,
        parentId: newParentId,
      };
      try {
        await pagesDb.insert(updatedPage);
      } catch {
        throw new ErrorWithFeedback(Feedbacks.E_UPDATING_PAGE);
      }
    },

    async updatePagePosition(page: PageModel, position: number) {
      try {
        await pagesDb.insert({
          ...page,
          contentUpdated: false,
          position,
        });
      } catch {
        throw new ErrorWithFeedback(Feedbacks.E_UPDATING_PAGE);
      }
    },

    async deletePage(page: PageModelWithRev) {
      try {
        await pagesDb.destroy(page._id, page._rev);

        // Update child pages
        const childPages = await pagesDb.find({
          selector: { parentId: page._id } as PageSelector,
        });

        for (const childPage of childPages.docs) {
          childPage.parentId = page.parentId;
          childPage.contentUpdated = false;
          await pagesDb.insert(childPage);
        }
      } catch {
        throw new ErrorWithFeedback(Feedbacks.E_DELETING_PAGE);
      }
    },

    async insertFile(file: FileModel) {
      let doc: DocumentInsertResponse;
      try {
        // const { rev } = await filesDb.insert(file);
        // doc = rev;
        doc = await filesDb.insert(file);
      } catch {
        throw new ErrorWithFeedback(Feedbacks.E_CREATING_FILE);
      }

      return doc;
    },

    async insertFileAttachment(attachment: FileAttachmentModel) {
      let att: DocumentInsertResponse;
      try {
        att = await filesDb.attachment.insert(
          attachment.fileId,
          attachment.attachmentName,
          attachment.attachment,
          attachment.contentType,
          attachment.params
        );
      } catch {
        throw new ErrorWithFeedback(Feedbacks.E_CREATING_ATTACHMENT);
      }

      return att;
    },

    async cleanupOrphanedFiles() {
      /* Our main assumption here is that each file has only one attachment,
       * even though CouchDb allows multiple attachments per document.
       * This simplifies the logic and is sufficient for our use case; in a more
       * complex scenario we would have to consider which attachments are used.
       */
      const usedFiles = new Set<string>();
      const { rows: pageRows } = await pagesDb.list({ include_docs: true });

      pageRows.forEach((row) => {
        extractFileRefsFrom(row.doc?.pageContent ?? '').forEach((ref) =>
          usedFiles.add(ref)
        );
      });

      const { rows: fileRows } = await filesDb.list();
      const files = fileRows.map((row) => ({
        _id: row.id,
        _rev: row.value.rev,
      }));

      const unusedFiles = files.filter((file) => !usedFiles.has(file._id));

      if (unusedFiles.length === 0) {
        return 0;
      }

      const BATCH_SIZE = 50;
      for (let i = 0; i < unusedFiles.length; i += BATCH_SIZE) {
        const batch = unusedFiles.slice(i, i + BATCH_SIZE);

        const deleteOps = batch.map((file) => ({
          _id: file._id,
          _rev: file._rev,
          _deleted: true,
        }));

        try {
          await filesDb.bulk({ docs: deleteOps });
        } catch (error) {
          console.error(`Error deleting batch starting at index ${i}:`, error);
          throw error;
        }
      }

      return unusedFiles.length;
    },

    async getFileById(fileId: string): Promise<FileModel | null> {
      let file: FileModel | null = null;
      try {
        file = await filesDb.get(fileId);
      } catch (err: unknown) {
        if ((err as { statusCode?: number })?.statusCode !== 404) {
          throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
        }
      }

      return file;
    },

    async getFileAttachment(fileId: string, attachmentName: string) {
      let attachment: Buffer | null = null;
      try {
        attachment = await filesDb.attachment.get(fileId, attachmentName);
      } catch (err: unknown) {
        if ((err as { statusCode?: number })?.statusCode !== 404) {
          throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
        }
      }

      return attachment;
    },

    async getPageHistory(page: PageModel): Promise<PageModel[]> {
      const doc = await pagesDb.get(page._id, { revs_info: true });

      if (!doc._revs_info) return [];

      const history = (
        (await Promise.all(
          (doc._revs_info as PageRevInfo[]).map(async (rev) => {
            if (rev.status !== 'available') return null;
            if (rev.rev === doc._rev) return null;
            const revisionDoc = await pagesDb.get(page._id, { rev: rev.rev });
            if (!revisionDoc.contentUpdated) return null;
            return {
              pageTitle: revisionDoc.pageTitle,
              updatedAt: revisionDoc.updatedAt,
              _rev: revisionDoc._rev,
            };
          })
        )) as PageModel[]
      ).filter((item) => item !== null);

      return history;
    },

    async getPageHistoryItem(
      page: PageModel,
      version: string
    ): Promise<PageModel> {
      const revisionDoc = await pagesDb.get(page._id, { rev: version });

      return {
        pageTitle: revisionDoc.pageTitle,
        pageContent: revisionDoc.pageContent,
        updatedAt: revisionDoc.updatedAt,
        _rev: revisionDoc._rev,
      } as PageModel;
    },

    async createMagic(email: string, ttlMinutes: number) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlMinutes * 60000);

      const data: MagicModel = {
        _id: dbService.generateIdFor('magic'),
        email,
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        used: false,
      };

      await magicsDb.insert(data);
      return data;
    },

    async validateMagic(magicId: string): Promise<string | null> {
      const result = await magicsDb.find({
        selector: {
          _id: magicId,
          used: false,
          expiresAt: {
            $gt: new Date().toISOString(),
          },
        },
        limit: 1,
      });

      if (result.docs.length === 0) {
        return null;
      }

      // Mark token as used
      const magic = result.docs[0];
      magic.used = true;
      await magicsDb.insert(magic);

      return result.docs[0].email;
    },

    async getUserByEmail(email: string): Promise<UserModel | null> {
      try {
        const result = await userDb.find({
          selector: { email },
          limit: 1,
        });

        return result.docs[0] || null;
      } catch (err) {
        console.log(err);
        return null;
      }
    },

    async getAllUsers(): Promise<UserModel[]> {
      try {
        const result = await userDb.list({ include_docs: true });
        return result.rows
          .filter((row) => !row.id.startsWith('_')) // Skip design docs
          .map((row) => row.doc) as UserModel[];
      } catch (err) {
        console.log(err);
        throw new ErrorWithFeedback(Feedbacks.E_UNKNOWN_ERROR);
      }
    },

    async insertUser(user: UserModel): Promise<void> {
      try {
        await userDb.insert(user);
      } catch (err) {
        console.log(err);
        throw new ErrorWithFeedback(Feedbacks.E_CREATING_USER);
      }
    },

    async updateUser(user: UserModel): Promise<void> {
      try {
        await userDb.insert(user);
      } catch (err) {
        console.log(err);
        throw new ErrorWithFeedback(Feedbacks.E_UPDATING_USER);
      }
    },

    async deleteUser(userId: string): Promise<void> {
      try {
        const user = await userDb.get(userId);
        await userDb.destroy(userId, user._rev);
      } catch (error) {
        // If user doesn't exist (404) just ignore
        if ((error as { statusCode?: number })?.statusCode !== 404) {
          console.log(error);
          throw new ErrorWithFeedback(Feedbacks.E_DELETING_USER);
        }
      }
    },

    async nukeTests() {
      if (!isTestRun) return;

      await this.safeNuke('pages');

      await this.safeNuke('settings');
      await this.getSettings();

      await this.safeNuke('files');
      await this.safeNuke('magics');
      await this.safeNuke('sessions');
      await this.safeNuke('users');

      try {
        await dbService._createIndexes(client);
        await dbService._createViews(client);
      } catch {
        // Index might already exist, that's fine
      }
    },

    async safeNuke(dbName: DbName) {
      const name = dbn(dbName);

      // Ensure we are deleting the test database
      if (!name.includes('-test')) {
        return;
      }

      try {
        await client.db.destroy(name);
        await client.db.create(name);
      } catch (error) {
        console.log(error);
      }
    },
  };
}

// bulk-load uses the same logic
dbService.generateIdFor = (model: ModelName) => `${model}:${createId()}`;

dbService._createIndexes = async (client: nano.ServerScope) => {
  await client.db.use(dbn('pages')).createIndex({
    index: {
      fields: ['parentId', 'createdAt'],
    },
  });

  await client.db.use(dbn('pages')).createIndex({
    index: {
      fields: ['parentId', 'position'],
    },
  });
};

dbService._createViews = async (client: nano.ServerScope) => {
  const db = await client.db.use(dbn('pages'));

  const designDoc = {
    _id: '_design/pages',
    views: {
      by_parent_position: {
        map: `function(doc) {
          if (doc.position !== undefined) {
            emit([doc.parentId || null, doc.position], null);
          }
        }`,
      },

      count: {
        map: `function(doc) {
          if (!doc._id.startsWith('_design/')) {
            emit(null, 1);
          }
        }`,
        reduce: '_count',
      },
    },
  };

  try {
    const existing = await db.get('_design/pages');
    const updatedDoc = { ...designDoc, _rev: existing._rev };
    await db.insert(updatedDoc);
  } catch (err) {
    if ((err as { statusCode?: number })?.statusCode === 404) {
      await db.insert(designDoc);
    } else {
      throw err;
    }
  }
};

dbService.init = async (params: DbServiceInitParams) => {
  const couchdb = nano({
    url: params.serverUrl,
    requestDefaults: {
      auth: {
        username: params.username,
        password: params.password,
      },
    },
  });

  isTestRun = params.env === 'test';

  try {
    await couchdb.db.get(dbn('pages'));
  } catch {
    await couchdb.db.create(dbn('pages'));
  }

  try {
    await couchdb.db.get(dbn('settings'));
  } catch {
    await couchdb.db.create(dbn('settings'));
  }

  try {
    await couchdb.db.get(dbn('files'));
  } catch {
    await couchdb.db.create(dbn('files'));
  }

  try {
    await couchdb.db.get(dbn('magics'));
  } catch {
    await couchdb.db.create(dbn('magics'));
  }

  try {
    await couchdb.db.get(dbn('sessions'));
  } catch {
    await couchdb.db.create(dbn('sessions'));
  }

  try {
    await couchdb.db.get(dbn('users'));
  } catch {
    await couchdb.db.create(dbn('users'));
  }

  try {
    await dbService._createIndexes(couchdb);
    await dbService._createViews(couchdb);
  } catch {
    // Index might already exist, that's fine
  }

  return couchdb;
};
