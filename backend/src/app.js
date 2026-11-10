// Builds the Express application around an injected PostgreSQL pool.
import express from 'express';
import session from 'express-session';
import cors from 'cors';
import env from './config/env.js';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from './constants.js';
import apiRouter from './routes/index.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';
import { sessionCookieOptions, requireProductionHttps, upgradeSessionCookie } from './middleware/sessionCookies.js';
import { createSessionStore } from './db/sessionStore.js';

/**
 * Creates the API application using the supplied database pool.
 * @param {import('pg').Pool} pool Shared PostgreSQL pool.
 * @param {{nodeEnv?: string}} options Runtime mode override for isolated application tests.
 * @returns {import('express').Express} Configured Express application.
 * @throws {Error} When the session middleware cannot be configured.
 */
export function createApp(pool, { nodeEnv = env.nodeEnv } = {}) {
  const app = express();
  app.set('env', nodeEnv);
  app.locals.sessionCookieOptions = sessionCookieOptions(nodeEnv);

  if (nodeEnv === 'production') {
    app.set('trust proxy', 1);
    app.use(requireProductionHttps);
  }

  // The production frontend normally reaches this service through its /api proxy.
  app.use(
    cors({
      origin: 'https://frontend-eta-fawn-j8xf3k2cfw.vercel.app',
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
      exposedHeaders: ['Retry-After'],
    }),
  );

  app.locals.pool = pool;
  app.use(express.json({ limit: '10kb' }));

  app.use(
    session({
      store: createSessionStore(pool),
      name: SESSION_COOKIE_NAME,
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        ...app.locals.sessionCookieOptions,
        maxAge: SESSION_MAX_AGE_MS,
      },
    }),
  );

  app.use(upgradeSessionCookie);
  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
