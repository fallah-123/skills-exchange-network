// Defaults to a read-only preflight. Applies only migration 003 when explicitly requested.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pool from '../src/db/pool.js';
import env from '../src/config/env.js';
import { checkDatabaseReadiness } from '../src/db/readiness.js';

let client;
try {
  const { values } = parseArgs({ options: {
    apply: { type: 'boolean', default: false },
    'expected-host': { type: 'string' },
    'expected-database': { type: 'string' }
  } });
  if (values.apply && (values['expected-host'] !== env.database.host || values['expected-database'] !== env.database.name)) {
    throw new Error('Apply requires --expected-host and --expected-database matching the configured target.');
  }
  client = await pool.connect();
  await client.query(values.apply ? 'BEGIN' : 'BEGIN READ ONLY');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  if (values.apply) await client.query('SELECT pg_advisory_xact_lock(1297303373, 0)');
  const target = (await client.query('SELECT current_database() AS database, current_user AS role')).rows[0];
  if (target.database !== env.database.name) throw new Error('Connected database differs from configured target.');
  console.info(`Target: ${env.database.host}:${env.database.port}/${target.database}; role: ${target.role}`);
  const errors = await checkDatabaseReadiness(client, { messaging: false });
  if (errors.length) throw new Error(errors.join('; '));
  const existing = await client.query("SELECT to_regclass('public.conversations') AS conversations, to_regclass('public.messages') AS messages");
  if (existing.rows[0].conversations || existing.rows[0].messages) {
    throw new Error('Messaging objects already exist. Run check:db and inspect migration history; migration 003 will not be reapplied.');
  }
  if (!values.apply) {
    await client.query('ROLLBACK');
    console.info('Preflight passed. No changes made. Migration 003 adds two empty tables and their indexes, guards and privacy restrictions.');
  } else {
    const sql = await readFile(new URL('../db/migrations/003_private_messaging.sql', import.meta.url), 'utf8');
    // Own the transaction so post-migration checks can roll back all new objects.
    if (!/^BEGIN;$/m.test(sql) || !/^COMMIT;\s*$/m.test(sql)) throw new Error('Unexpected migration transaction format.');
    await client.query(sql.replace(/^BEGIN;\r?\n/m, '').replace(/^COMMIT;\s*$/m, ''));
    const failures = await checkDatabaseReadiness(client);
    if (failures.length) throw new Error(failures.join('; '));
    await client.query('COMMIT');
    console.info('Migration 003 committed; database readiness checks passed.');
  }
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(`Messaging migration failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end();
}
