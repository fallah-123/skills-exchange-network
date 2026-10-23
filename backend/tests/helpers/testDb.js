// Provides a test-only pool and guards every destructive reset against real databases.
import env from '../../src/config/env.js';
import pg from 'pg';

const { Pool } = pg;
if (env.nodeEnv !== 'test' || env.database.name !== env.database.testName ||
    env.database.name === env.database.maintenanceName || !env.database.name.endsWith('_test')) {
  throw new Error('Refusing test database access: configured database is not the validated test database.');
}

/** Dedicated PostgreSQL pool whose target is verified as the configured test database. */
export const testPool = new Pool({
  host: env.database.host,
  port: env.database.port,
  database: env.database.name,
  user: env.database.user,
  password: env.database.password
});

/** Removes all app rows and resets identities only in the validated test database. */
export async function resetTestDatabase() {
  await testPool.query(
    'TRUNCATE users, developer_profiles, skills, developer_skills, collaboration_requests, user_sessions RESTART IDENTITY CASCADE'
  );
}
