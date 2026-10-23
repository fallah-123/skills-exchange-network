// Creates isolated Express applications and Supertest agents using only testPool.
import request from 'supertest';
import env from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { testPool } from './testDb.js';

if (env.nodeEnv !== 'test' || env.database.name !== env.database.testName) {
  throw new Error('API tests may only run against DB_NAME_TEST.');
}

/** Creates an app instance and cookie-persisting Supertest agent for API tests. */
export function createApi() {
  const app = createApp(testPool);
  return { app, agent: request.agent(app) };
}
