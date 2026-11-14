// No automatic migrations on startup. Default is read-only; apply is explicit.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import pool from '../src/db/pool.js';
import env from '../src/config/env.js';
import { checkDatabaseReadiness } from '../src/db/readiness.js';
let client;
try {
  const { values } = parseArgs({ options: {
    apply: { type: 'boolean', default: false },
    'allow-hosted': { type: 'boolean', default: false },
    'expected-host': { type: 'string' }, 'expected-database': { type: 'string' }, 'expected-user': { type: 'string' },
  } });
  if (values.apply) {
    if (values['expected-host'] !== env.database.host || values['expected-database'] !== env.database.name || values['expected-user'] !== env.database.user) {
      throw new Error('Apply requires expected host, database and user matching the configured target.');
    }
    if (!['localhost', '127.0.0.1', '::1'].includes(env.database.host) && !values['allow-hosted']) {
      throw new Error('Hosted migration requires separate production authorization and explicit --allow-hosted.');
    }
  }
  client = await pool.connect();
  await client.query(values.apply ? 'BEGIN' : 'BEGIN READ ONLY');
  await client.query("SET LOCAL lock_timeout = '5s'");
  await client.query("SET LOCAL statement_timeout = '30s'");
  if (values.apply) await client.query('SELECT pg_advisory_xact_lock(1297303373, 0)');
  const target = (await client.query('SELECT current_database() AS database, current_user AS role')).rows[0];
  const expectedRole = env.database.user.startsWith('postgres.') ? 'postgres' : env.database.user;
  if (target.database !== env.database.name || target.role !== expectedRole) throw new Error('Connected target identity does not match configuration.');
  const failures = await checkDatabaseReadiness(client);
  if (failures.length) throw new Error(failures.join('; '));
  const existing = await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname LIKE 'notifications%'
    UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname LIKE 'notifications%'`);
  if (existing.rowCount) throw new Error('Notification objects already exist; inspect readiness and migration history. Refusing partial or repeat apply.');
  if (values.apply) {
    const sql = await readFile(new URL('../db/migrations/004_notifications.sql', import.meta.url), 'utf8');
    if (!/^BEGIN;$/m.test(sql) || !/^COMMIT;\s*$/m.test(sql)) throw new Error('Unexpected migration transaction format.');
    await client.query(sql.replace(/^BEGIN;\r?\n/m, '').replace(/^COMMIT;\s*$/m, ''));
    const checks = await checkDatabaseReadiness(client, { notifications: true });
    if (checks.length) throw new Error(checks.join('; '));
    await client.query('COMMIT');
    console.info('Migration 004 committed; notification readiness checks passed.');
  } else {
    await client.query('ROLLBACK');
    console.info('Notification preflight passed. No database changes made.');
  }
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(`Notification migration failed: ${error.message}`);
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
