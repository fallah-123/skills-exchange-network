// Builds the Express application around an injected PostgreSQL pool.
import express from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import env from './config/env.js';
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_MS } from './constants.js';
import apiRouter from './routes/index.js';
import notFound from './middleware/notFound.js';
import errorHandler from './middleware/errorHandler.js';

const PostgreSqlSessionStore = connectPgSimple(session);

/**
 * Creates the API application using the supplied database pool.
 * @param {import('pg').Pool} pool Shared PostgreSQL pool.
 * @returns {import('express').Express} Configured Express application.
 * @throws {Error} When the session middleware cannot be configured.
 */
export function createApp(pool) {
  const app = express();
  if (env.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }
  app.locals.pool = pool;
  app.use(express.json({ limit: '10kb' }));
  app.use(session({
    store: new PostgreSqlSessionStore({
      pool,
      tableName: 'user_sessions',
      createTableIfMissing: false
    }),
    name: SESSION_COOKIE_NAME,
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.nodeEnv === 'production',
      maxAge: SESSION_MAX_AGE_MS
    }
  }));
  app.use('/api', apiRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
