import type {
  AnyLogger,
  ConfigEnv,
  DocumentModel,
  Feedback,
  UserModel,
} from 'boxedo-core/types';
import { err, ok, type Result } from 'neverthrow';
import { Feedbacks } from '~/lib/feedbacks';
import { BaseRepository } from './BaseRepository';

const DEFAULT_USER_VALUES: Partial<UserModel> = {
  // Added on 25 March 2025
  role: 'reader',
} as const;

const ensureUserDefaults = (user: UserModel): UserModel => ({
  ...DEFAULT_USER_VALUES,
  ...user,
});

export class UserRepository extends BaseRepository {
  constructor(
    protected db: PouchDB.Database<DocumentModel>,
    protected config: ConfigEnv,
    protected logger: AnyLogger
  ) {
    super(db, config, logger);
  }

  async getUserByEmail(
    email: string
  ): Promise<Result<UserModel | null, Feedback>> {
    try {
      const result = (await this.db.find({
        selector: {
          type: 'user',
          email,
        },
        limit: 1,
      })) as PouchDB.Find.FindResponse<UserModel>;
      let user = null;
      if (result.docs.length > 0) {
        user = ensureUserDefaults(result.docs[0]);
      }
      return ok(user);
    } catch (error) {
      this.logger.error(`Error getting user by email: ${error}`);
      return ok(null);
    }
  }

  async getAllUsers(): Promise<Result<UserModel[], Feedback>> {
    try {
      const result = (await this.db.find({
        selector: {
          type: 'user',
        },
      })) as PouchDB.Find.FindResponse<UserModel>;

      return ok(result.docs);
    } catch (error) {
      this.logger.error(`Error getting all users: ${error}`);
      return err(Feedbacks.E_UNKNOWN_ERROR);
    }
  }

  async insertUser(user: UserModel): Promise<Result<void, Feedback>> {
    try {
      await this.db.put(user);
      return ok();
    } catch (error) {
      this.logger.error(`Error inserting a user: ${error}`);
      return err(Feedbacks.E_CREATING_USER);
    }
  }

  async updateUser(user: UserModel): Promise<Result<void, Feedback>> {
    try {
      await this.db.put(user);
      return ok();
    } catch (error) {
      this.logger.error(`Error updating a user: ${error}`);
      return err(Feedbacks.E_UPDATING_USER);
    }
  }

  async deleteUser(userId: string): Promise<Result<void, Feedback>> {
    try {
      let id = userId;
      if (!id.startsWith('user:')) {
        id = `user:${userId}`;
      }
      const user = await this.db.get(id);
      await this.db.remove(user);
      return ok();
    } catch (error) {
      // If user doesn't exist (404) just ignore
      if ((error as PouchDB.Core.Error).status !== 404) {
        this.logger.error(`Error deleting a user: ${error}`);
        return err(Feedbacks.E_DELETING_USER);
      }
      return ok();
    }
  }
}
