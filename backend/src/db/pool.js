// Creates the shared PostgreSQL pool from validated application configuration.
import pg from 'pg';
import env from '../config/env.js';

const { Pool } = pg;

/** Shared connection pool used by the server and injected into the application. */
const pool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password,
  ssl: env.nodeEnv === 'production' ? { rejectUnauthorized: true } : false,
});

export default pool;
