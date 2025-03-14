import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import type { FastifyInstance } from 'fastify';
import type { JSONSchema } from 'json-schema-to-ts';
import { readFile } from 'node:fs/promises';
import yaml from 'yaml';
import type { RepositoryFactory } from '../repositories/RepositoryFactory';
import { generateIdFor, nop } from './helpers';

/* Example
users:
  - claudio.cicali@gmail.com
    fullname: Claudio Cicali
  - some.else@somewhere.com
    fullname: Erika Musteramann
*/

const UsersYamlSchema = {
  type: 'object',
  required: ['users'],
  additionalProperties: false,
  properties: {
    users: {
      type: ['array', 'null'],
      items: {
        type: 'object',
        required: ['email'],
        additionalProperties: false,
        properties: {
          email: {
            type: 'string',
            format: 'email',
          },
          fullname: {
            type: 'string',
            default: 'Anonymous',
          },
        },
      },
    },
  },
} as const satisfies JSONSchema;

const ajv = new Ajv({ useDefaults: true });
addFormats(ajv);

const validateYamlConfig = ajv.compile(UsersYamlSchema);

interface SyncOptions {
  app: FastifyInstance;
  repoFactory: RepositoryFactory;
  dryRun?: boolean;
}

interface YamlUser {
  email: string;
  fullname: string;
}

interface YamlConfig {
  users: YamlUser[];
}

export async function syncUsers(options: SyncOptions) {
  const { app, repoFactory, dryRun = false } = options;
  const userRepo = repoFactory.getUserRepository();

  try {
    const fileContent = await readFile('./users.yaml', 'utf8');
    const rawData = yaml.parse(fileContent);

    if (!validateYamlConfig(rawData)) {
      const err = validateYamlConfig.errors;
      if (!err) {
        app.log.error('YAML validation failed for unknown reason!');
        return;
      }

      if (err[0].instancePath === '') {
        app.log.error(`Users YAML validation failed: ${err[0].message}`);
        return;
      }

      app.log.error(
        `Users YAML validation failed: ${err[0].instancePath} ${err[0].message}`
      );
      return;
    }

    const data = rawData as YamlConfig;

    // This happens if there is only the string "users:" in users.yaml
    if (data.users === null) {
      data.users = [];
    }

    const existingUsers = (await userRepo.getAllUsers()).match(
      (users) => users,
      (feedback) => {
        throw new Error(feedback.message);
      }
    );
    const existingEmails = new Set(existingUsers.map((u) => u.email));
    const yamlEmails = new Set(data.users.map((u) => u.email));

    const usersToAdd = data.users.filter(
      (user) => !existingEmails.has(user.email)
    );
    const usersToRemove = existingUsers.filter(
      (user) => !yamlEmails.has(user.email)
    );
    const usersToUpdate = data.users.filter((user) => {
      const existingUser = existingUsers.find((u) => u.email === user.email);
      return existingUser && existingUser.fullname !== user.fullname;
    });

    app.log.info(`${dryRun ? '[DRY RUN] ' : ''}User sync plan:
      To Add: ${usersToAdd.length} ${usersToAdd.map((u) => u.email).join(', ')}
      To Update: ${usersToUpdate.length} ${usersToUpdate.map((u) => u.email).join(', ')}
      To Remove: ${usersToRemove.length} ${usersToRemove.map((u) => u.email).join(', ')}
    `);

    if (dryRun) {
      app.log.info('[DRY RUN] No changes were made');
      return;
    }

    for (const user of usersToAdd) {
      const userId = generateIdFor('user');
      (
        await userRepo.insertUser({
          type: 'user',
          _id: userId,
          email: user.email,
          fullname: user.fullname,
          createdAt: new Date().toISOString(),
        })
      ).match(nop, (feedback) => {
        throw new Error(feedback.message);
      });
      app.log.info(`Added user: ${user.email}`);
    }

    for (const user of usersToUpdate) {
      const existingUser = existingUsers.find((u) => u.email === user.email);
      if (existingUser) {
        (
          await userRepo.updateUser({
            ...existingUser,
            fullname: user.fullname,
          })
        ).match(nop, (feedback) => {
          throw new Error(feedback.message);
        });
        app.log.info(`Updated user: ${user.email}`);
      }
    }

    for (const user of usersToRemove) {
      (await userRepo.deleteUser(user._id)).match(nop, (feedback) => {
        throw new Error(feedback.message);
      });
      app.log.info(`Removed user: ${user.email}`);
    }

    app.log.info(`User sync completed:
      Added: ${usersToAdd.length}
      Updated: ${usersToUpdate.length}
      Removed: ${usersToRemove.length}
    `);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      app.log.info('No users.yaml file found, skipping sync');
      return;
    }
    // Log and re-throw other errors
    app.log.error(
      `Error syncing users: ${error instanceof Error ? error.message : String(error)}`
    );
    throw error;
  }
}
