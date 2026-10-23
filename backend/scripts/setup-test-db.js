// Recreates only the explicitly configured, safety-checked test database.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import env from '../src/config/env.js';

const { Pool } = pg;
const migrationsDirectory = fileURLToPath(new URL('../db/migrations/', import.meta.url));

function validateTarget() {
  const { maintenanceName, testName } = env.database;
  if (!testName || testName !== env.database.testName || testName === maintenanceName || !testName.endsWith('_test')) {
    throw new Error('Refusing test database setup: target must equal DB_NAME_TEST, differ from DB_NAME, and end with _test.');
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(testName)) {
    throw new Error('Refusing test database setup: DB_NAME_TEST contains unsupported characters.');
  }
}

async function createDatabaseIfMissing() {
  const maintenancePool = new Pool({
    ...env.database,
    database: env.database.maintenanceName
  });
  try {
    const result = await maintenancePool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [env.database.testName]
    );
    if (result.rowCount === 0) {
      await maintenancePool.query(`CREATE DATABASE "${env.database.testName}"`);
    }
  } finally {
    await maintenancePool.end();
  }
}

async function applyMigrations(testPool) {
  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((fileName) => fileName.endsWith('.sql'))
    .sort();
  for (const migrationFile of migrationFiles) {
    const sql = await readFile(path.join(migrationsDirectory, migrationFile), 'utf8');
    await testPool.query(sql);
  }
}

async function setupTestDatabase() {
  validateTarget();
  await createDatabaseIfMissing();
  const testPool = new Pool({
    ...env.database,
    database: env.database.testName
  });
  try {
    await testPool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await applyMigrations(testPool);
    console.info(`Test database ready: ${env.database.testName}`);
  } finally {
    await testPool.end();
  }
}

setupTestDatabase().catch((setupError) => {
  console.error(`Test database setup failed: ${setupError.message}`);
  process.exitCode = 1;
});
