import { type Result, err, ok } from 'neverthrow';
import type { AnyLogger, ConfigEnv } from '~/../types';
import { RepositoryFactory } from '../repositories/RepositoryFactory';
import { DatabaseService } from '../services/DatabaseService';

export interface AppContextParams {
  config: ConfigEnv;
  logger: AnyLogger;
}

/**
 * AppContext provides access to database and repositories
 * throughout the application, whether running in the main app
 * or standalone scripts.
 */
export class AppContext {
  private static instance: AppContext;
  private databaseService: DatabaseService | null = null;
  private repositoryFactory: RepositoryFactory | null = null;
  private readonly logger: AnyLogger;
  private readonly config: ConfigEnv;

  private constructor(params: AppContextParams) {
    this.logger = params.logger;
    this.config = params.config;
  }

  /**
   * Initialize the application context
   */
  public static async create(
    params: AppContextParams
  ): Promise<Result<AppContext, Error>> {
    const { config, logger } = params;

    if (!AppContext.instance) {
      AppContext.instance = new AppContext(params);
    }

    try {
      // Initialize database service
      const dbResult = await DatabaseService.create({
        config,
        logger,
      });

      return dbResult.match(
        async (dbService) => {
          const repoFactory = await RepositoryFactory.create({
            db: dbService.getDatabase(),
            config,
            logger,
          });

          AppContext.instance.databaseService = dbService;
          AppContext.instance.repositoryFactory = repoFactory;

          return ok(AppContext.instance);
        },
        (error) => {
          logger.error('Failed to initialize database:', error);
          return err(
            new Error(`Database initialization failed: ${error.message}`)
          );
        }
      );
    } catch (error) {
      logger.error('Unexpected error during initialization:', error);
      return err(
        new Error(
          `Unexpected initialization error: ${error instanceof Error ? error.message : String(error)}`
        )
      );
    }
  }

  public static getInstance(): Result<AppContext, Error> {
    if (!AppContext.instance) {
      return err(new Error('AppContext has not been initialized'));
    }
    return ok(AppContext.instance);
  }

  public getRepositoryFactory(): RepositoryFactory {
    if (!this.repositoryFactory) {
      throw new Error('RepositoryFactory not initialized');
    }
    return this.repositoryFactory;
  }

  public getDatabaseService(): DatabaseService {
    if (!this.databaseService) {
      throw new Error('DatabaseService not initialized');
    }
    return this.databaseService;
  }

  public getLogger(): AnyLogger {
    return this.logger;
  }

  public getConfig(): ConfigEnv {
    return this.config;
  }
}
