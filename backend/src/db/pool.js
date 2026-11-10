// Creates the shared PostgreSQL pool from validated application configuration.
import pg from 'pg';
import env from '../config/env.js';
import { databaseSsl } from './ssl.js';

const { Pool } = pg;

/** Shared connection pool used by the server and injected into the application. */
const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
  ssl: databaseSsl({ nodeEnv: env.nodeEnv, ...env.database }),
  connectionTimeoutMillis: 10000,
});

export default pool;
