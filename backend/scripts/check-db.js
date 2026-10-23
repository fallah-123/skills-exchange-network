// Performs read-only checks that the owner-created PostgreSQL schema is ready.
import pool from '../src/db/pool.js';

const expectedTables = [
  'users',
  'developer_profiles',
  'skills',
  'developer_skills',
  'collaboration_requests',
  'user_sessions'
];
const expectedTriggers = [
  'users_set_updated_at',
  'developer_profiles_set_updated_at',
  'collaboration_requests_guard_trg',
  'collaboration_requests_set_updated_at'
];

async function checkDatabase() {
  try {
    const tables = await pool.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
      ['public', expectedTables]
    );
    const triggers = await pool.query(
      `SELECT trigger_name
       FROM information_schema.triggers
       WHERE event_object_schema = $1 AND trigger_name = ANY($2::text[])`,
      ['public', expectedTriggers]
    );
    const foundTables = new Set(tables.rows.map((row) => row.table_name));
    const foundTriggers = new Set(triggers.rows.map((row) => row.trigger_name));
    const missingTables = expectedTables.filter((name) => !foundTables.has(name));
    const missingTriggers = expectedTriggers.filter((name) => !foundTriggers.has(name));

    if (missingTables.length || missingTriggers.length) {
      console.error('Database check failed.');
      if (missingTables.length) console.error(`Missing tables: ${missingTables.join(', ')}`);
      if (missingTriggers.length) console.error(`Missing triggers: ${missingTriggers.join(', ')}`);
      process.exitCode = 1;
      return;
    }
    console.info('Database check passed: all expected tables and triggers exist.');
  } finally {
    await pool.end();
  }
}

checkDatabase().catch((databaseError) => {
  console.error(`Database check failed: ${databaseError.message}`);
  process.exitCode = 1;
});
