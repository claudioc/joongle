import fastifyCookie from '@fastify/cookie';
import csrfProtection from '@fastify/csrf-protection';
import fastifyEnv from '@fastify/env';
import fastifyFormbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import staticServe from '@fastify/static';
import kitaHtmlPlugin from '@kitajs/fastify-html-plugin';
import {
  ConfigEnvSchema,
  type ConfigEnv,
  type NodeEnv,
  type PreferencesModel,
  type SettingsModel,
  type UserModel,
} from 'boxedo-core';
import { phrases } from 'boxedo-core/locales/phrases';
import Fastify from 'fastify';
import fastifyFavicon from 'fastify-favicon';
import type { PinoLoggerOptions } from 'fastify/types/logger';
import osUtils from 'node-os-utils';
import path from 'node:path';
import { ASSETS_MOUNT_POINT } from '~/constants';
import fastifyCache, { type Cache } from '~/lib/plugins/cache';
import fastifyFeedback from '~/lib/plugins/feedback';
import fastifyI18n, { type i18nExtended } from '~/lib/plugins/i18n';
import type { RepositoryFactory } from '~/repositories/RepositoryFactory';
import { EmailService } from '~/services/emailService';
import { SearchService } from '~/services/SearchService';
import { UrlService } from '~/services/UrlService';
import { AppContext } from './AppContext';
import { getAssetsFsPath } from './assets';
import { validateConfig } from './config';
import { ensurePathExists, getDefaultLanguage } from './helpers';
import router from './router';

declare module 'fastify' {
  interface FastifyInstance {
    // The config is automatically loaded by the fastifyEnv plugin
    // and validated against the schema defined in types
    config: ConfigEnv;
    is: (env: NodeEnv) => boolean;
    settings: SettingsModel;
    i18n: i18nExtended;
    feedbackCode: number;
    cache: Cache;
    emailService: EmailService;
    context: AppContext;
    // This object is also in the context but we keep a copy
    // directly in app for convenience.
    repoFactory: RepositoryFactory;
    urlService: UrlService;
  }
  interface FastifyRequest {
    user: UserModel | null;
    preferences: PreferencesModel;
  }
}

// Fix thread-stream error due to __dirname in pino
if (process.env.NODE_ENV !== 'test') {
  // @ts-ignore
  globalThis.__bundlerPathsOverrides = {
    'thread-stream-worker': path.join(
      // @ts-ignore
      path.dirname(createRequire(import.meta.url).resolve('thread-stream')),
      'lib',
      'worker.js'
    ),
  };
}

const envToLogger: Record<NodeEnv, PinoLoggerOptions | boolean> = {
  development: {
    transport: {
      target: '@fastify/one-line-logger',
    },
  },
  production: true,
  test: false,
};

const app = Fastify({
  logger:
    envToLogger[(process.env.NODE_ENV as NodeEnv) || 'development'] ?? true,
});

if (process.env.NODE_ENV !== 'production') {
  // Do not log assets requests in development
  app.addHook('onRoute', (opts) => {
    if (opts.path.includes('/a/')) {
      opts.logLevel = 'silent';
    }
  });
}

setInterval(async () => {
  const cpu = await osUtils.cpu.usage();
  const mem = await osUtils.mem.info();
  app.log.info(
    `cpu: ${cpu}% - memory: ${mem.usedMemPercentage}% / ${mem.freeMemMb}`
  );
}, 30000);

await app.register(fastifyEnv, { schema: ConfigEnvSchema });

const configErrors = validateConfig(app.config);
if (configErrors.length > 0) {
  configErrors.forEach((err) => app.log.error(err));
  process.exit(1);
}

const emailService = EmailService.getInstance();

await emailService.initialize({
  type: app.config.BXD_EMAIL_PROVIDER ?? '',
  apiKey: app.config.BXD_EMAIL_API_KEY ?? '',
  domain: app.config.BXD_EMAIL_DOMAIN ?? '',
  host: app.config.EMAIL_HOST ?? '',
});

app.decorate('emailService', emailService);

const pathResult = await ensurePathExists(
  app.config.BXD_DB_LOCAL_PATH,
  'database directory'
);
if (pathResult.isErr()) {
  app.log.error(pathResult.error.message);
  process.exit(1);
}

UrlService.create(app.config);
app.decorate('urlService', UrlService.getInstance());

const contextResult = await AppContext.create({
  config: app.config,
  logger: app.log,
  urlService: UrlService.getInstance(),
});

if (contextResult.isErr()) {
  app.log.error(
    `Failed to initialize application context: ${contextResult.error}`
  );
  process.exit(1);
}

app.decorate('context', contextResult.value);

app.decorate('repoFactory', app.context.getRepositoryFactory());

// Initializes the search service instance, starting indexing the documents
if (app.config.NODE_ENV !== 'test') {
  await SearchService.create({
    repoFactory: app.context.getRepositoryFactory(),
    config: app.config,
    logger: app.log,
  });
}

if (app.config.NODE_ENV !== 'test') {
  await app.register(csrfProtection);
}

const settings = (
  await app.repoFactory.getSettingsRepository().getSettings()
).match(
  (settings) => settings,
  (feedback) => {
    app.log.error(`Failed to load application settings: ${feedback.message}`);
    process.exit(1);
  }
);

const siteLang = getDefaultLanguage(app.config);
await app.register(fastifyI18n, {
  defaultLocale: siteLang,
  phrases,
});
app.i18n.switchTo(siteLang);

app.decorate('settings', settings);
app.decorate('is', (env: NodeEnv) => env === app.config.NODE_ENV);

await app
  .register(fastifyCookie, {
    hook: 'onRequest',
  })
  .register(fastifyCache)
  .register(multipart)
  .register(fastifyFeedback)
  .register(fastifyFavicon, {
    path: getAssetsFsPath(),
    name: 'favicon.ico',
    maxAge: 3600,
  })
  .register(fastifyFormbody)
  .register(kitaHtmlPlugin)
  .register(helmet, {
    referrerPolicy: {
      policy: 'same-origin',
    },
    contentSecurityPolicy: {
      // If you get stuck in CSP, try this: crossOriginEmbedderPolicy: false,
      directives: {
        'script-src': [
          'http://localhost:35729/',
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
        ],
        'img-src': ['http:', 'https:', 'data:', 'blob:'],
        'connect-src': ['http:', "'self'", 'ws:'],
        'default-src': ["'self'", 'ws:'],
      },
    },
    hsts: app.config.NODE_ENV === 'production',
  })
  .register(staticServe, {
    root: getAssetsFsPath(),
    prefix: `/${ASSETS_MOUNT_POINT}`,
  })
  .register(router)
  .after(() => {
    app.log.info('Application initialized.');
  });

export default (isTestRun = false) => {
  // At the moment we use the same server for testing purposes
  // so we need to really be sure that we are not mixing up the environments
  if (
    (isTestRun && app.config.NODE_ENV !== 'test') ||
    (!isTestRun && app.config.NODE_ENV === 'test')
  ) {
    app.log.error('Test run is not set correctly');
    process.exit(1);
  }

  return app;
};
