// Seeds a small idempotent skill catalogue into the guarded test database only.
import pg from 'pg';
import '../tests/setup/loadTestEnv.js';

const env = (await import('../src/config/env.js')).default;
const testName = env.database.testName;
if (
  !testName
  || env.database.name !== testName
  || testName === env.database.maintenanceName
  || !testName.endsWith('_test')
  || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(testName)
) {
  throw new Error('Refusing skill seed: target must equal DB_NAME_TEST, differ from DB_NAME, and end with _test.');
}

const skills = [
  'JavaScript', 'React', 'Node.js', 'Python', 'Docker', 'Go',
  'Java', 'SQL', 'Git', 'Rust', 'PHP', 'Testing'
];
const pool = new pg.Pool({ ...env.database, database: testName });

try {
  for (const name of skills) {
    await pool.query('INSERT INTO skills (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
  }
  console.info(`Test skill catalogue ready (${skills.length} entries considered).`);
} catch (error) {
  console.error(`Test skill seed failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
