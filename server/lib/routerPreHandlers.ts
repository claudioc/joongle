import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  HookHandlerDoneFunction,
} from 'fastify';
import { SESSION_COOKIE_NAME } from '~/constants';

export const createRequireAuth = (app: FastifyInstance) => {
  return async (req: FastifyRequest, rep: FastifyReply) => {
    const { config, repoFactory: repos } = app;
    const userRepo = repos.getUserRepository();
    const sessionRepo = repos.getSessionRepository();

    req.user = null;

    if (app.is('test') || config.AUTHENTICATION_TYPE === 'none') {
      return;
    }

    const sessionId = req.cookies.session;

    if (!sessionId) {
      return rep.redirect('/auth/login');
    }

    const session = (await sessionRepo.getSessionById(sessionId)).match(
      (session) => session,
      (feedback) => {
        throw new Error(feedback.message);
      }
    );

    if (!session || new Date(session.expiresAt) < new Date()) {
      rep.clearCookie(SESSION_COOKIE_NAME);
      return rep.redirect('/auth/login');
    }

    const user = (await userRepo.getUserByEmail(session.email)).match(
      (user) => user,
      (feedback) => {
        throw new Error(feedback.message);
      }
    );

    if (!user) {
      rep.clearCookie(SESSION_COOKIE_NAME);
      return rep.redirect('/auth/login');
    }

    // Add user to request for use in routes
    req.user = user;
  };
};

export const createRequireCsrf = (app: FastifyInstance) => {
  return (
    req: FastifyRequest,
    rep: FastifyReply,
    done: HookHandlerDoneFunction
  ) => {
    if (app.is('test')) {
      done();
      return;
    }

    return app.csrfProtection.call(app, req, rep, done);
  };
};
