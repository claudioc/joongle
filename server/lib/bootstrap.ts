import Fastify from 'fastify';
import helmet from '@fastify/helmet';
import staticServe from '@fastify/static';
import fastifyFormbody from '@fastify/formbody';
import fastifyFavicon from 'fastify-favicon';
import type { PinoLoggerOptions } from 'fastify/types/logger';
import fastifyEnv from '@fastify/env';
import path from 'node:path';
import router from './router';
import type { NodeEnv, SettingsModel } from '~/../types';
import kitaHtmlPlugin from '@kitajs/fastify-html-plugin';
import type { FromSchema } from 'json-schema-to-ts';
import { fileURLToPath } from 'node:url';
import csrfProtection from '@fastify/csrf-protection';
import fastifyCookie from '@fastify/cookie';
import { ASSETS_MOUNT_POINT, ASSETS_PATH } from '~/constants';
import { dbService, type DbClient } from '~/services/dbService';
import fastifyI18n, { type i18nExtended } from '~/lib/plugins/i18n';
import fastifyFeedback from '~/lib/plugins/feedback';
import en from '../locales/en.json';
import it from '../locales/it.json';

declare module 'fastify' {
  interface FastifyInstance {
    config: FromSchema<typeof ConfigEnvSchema>;
    settings: SettingsModel;
    dbClient: DbClient;
    i18n: i18nExtended;
    feedbackCode: number;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const ConfigEnvSchema = {
  type: 'object',
  properties: {
    ADDRESS: { type: 'string', default: 'localhost' },
    PORT: { type: 'integer', default: 3000 },
    NODE_ENV: { type: 'string', default: 'development' },
    COUCHDB_URL: {
      type: 'string',
      default: 'http://localhost:5984',
    },
    DB_USER: { type: 'string' },
    DB_PASSWORD: { type: 'string' },
    LIVERELOAD_PORT: { type: 'integer', default: 8007 },
    LIVERELOAD_ADDRESS: { type: 'string', default: 'localhost' },
  },
} as const;

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
  // ignoreTrailingSlash: true,
  logger:
    envToLogger[(process.env.NODE_ENV as NodeEnv) || 'development'] ?? true,
});

try {
  app.decorate(
    'dbClient',
    await dbService.init({
      serverUrl: process.env.COUCHDB_URL ?? '',
      username: process.env.DB_USER ?? '',
      password: process.env.DB_PASSWORD ?? '',
      env: process.env.NODE_ENV as NodeEnv,
    })
  );
} catch {
  throw new Error('Cannot establish a database connection.');
}

await app.register(fastifyCookie);

if (process.env.NODE_ENV !== 'test') {
  await app.register(csrfProtection);
}

await app.register(fastifyI18n, {
  defaultLocale: 'en',
  locales: {
    en,
    it,
  },
});

await app.register(fastifyFeedback);

const dbs = await dbService(app.dbClient);
const settings = await dbs.getSettings();
app.i18n.switchTo(settings.siteLang);

app.decorate('settings', settings);
await app.register(fastifyEnv, { schema: ConfigEnvSchema }).then(() => {
  app
    .register(fastifyFavicon, {
      path: './assets',
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
          'img-src': ['https:', 'data:', 'blob:'],
          'connect-src': ['http:', "'self'", 'ws:'],
          'default-src': ["'self'", 'ws:'],
        },
      },
      hsts: app.config.NODE_ENV === 'production',
    })
    .register(staticServe, {
      root: path.join(__dirname, ASSETS_PATH),
      prefix: `/${ASSETS_MOUNT_POINT}`,
    })
    .register(router)
    .after(() => {
      app.log.info('Application initialized.');
    });
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
