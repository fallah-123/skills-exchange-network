// Rehearse 004 on a newly created local database, never an existing application DB.
import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { checkNotificationReadiness } from '../src/db/notificationReadiness.js';
if (process.env.NODE_ENV !== 'test' || !['localhost','127.0.0.1','::1'].includes(process.env.DB_HOST)) throw new Error('Use an isolated local PostgreSQL test server.');
const database = `sdn_notifications_${randomUUID().replaceAll('-', '')}_test`;
const connection = { host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD };
const admin = new pg.Client({ ...connection, database: process.env.DB_NAME });
let db, created = false;
const run = (args = []) => spawnSync(process.execPath, ['scripts/migrate-notifications.js', ...args], {
  env: { ...process.env, DB_NAME_TEST: database }, encoding: 'utf8', timeout: 45000,
});
const tables = ['users','developer_profiles','skills','developer_skills','collaboration_requests','user_sessions','conversations','messages'];
async function snapshot() {
  const rows = [];
  for (const table of tables) rows.push((await db.query(`SELECT row_to_json(t) AS row FROM public.${table} t ORDER BY row_to_json(t)::text`)).rows);
  return rows;
}
try {
  await admin.connect(); await admin.query(`CREATE DATABASE "${database}"`); created = true;
  db = new pg.Client({ ...connection, database }); await db.connect();
  for (const file of ['001_initial_schema.sql','002_session_table.sql','003_private_messaging.sql']) {
    await db.query(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.query(`INSERT INTO users(display_name,email,password_hash) VALUES ('First Test','first@example.test','synthetic'),('Second Test','second@example.test','synthetic');
    INSERT INTO developer_profiles(user_id) VALUES (1),(2);
    INSERT INTO skills(name) VALUES ('Test Skill'); INSERT INTO developer_skills VALUES (1,1,'offered',now());
    INSERT INTO collaboration_requests(sender_id,recipient_id,status) VALUES (1,2,'accepted');
    INSERT INTO conversations(collaboration_request_id) VALUES (1);
    INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES (1,1,'f95e569a-1215-492e-8840-f48d73cb8c90','Existing message');
    INSERT INTO user_sessions VALUES ('synthetic-session','{}',now()+interval '1 day');`);
  const original = await snapshot();
  const preflight = run(); assert.equal(preflight.status, 0, preflight.stdout + preflight.stderr);
  assert.equal((await db.query("SELECT to_regclass('public.notifications') AS name")).rows[0].name, null);
  const args = ['--apply','--expected-host',connection.host,'--expected-database',database,'--expected-user',connection.user];
  assert.notEqual(run(['--apply','--expected-host','wrong-host']).status, 0);
  await db.query('CREATE TABLE notifications_unexpected(id integer)');
  assert.notEqual(run(args).status, 0); await db.query('DROP TABLE notifications_unexpected');
  // Fail after CREATE TABLE but before indexes: the real runner must roll back everything.
  await db.query(`CREATE FUNCTION reject_notification_index() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected migration failure'; END; $$;
    CREATE EVENT TRIGGER reject_notification_index ON ddl_command_start WHEN TAG IN ('CREATE INDEX') EXECUTE FUNCTION reject_notification_index();`);
  assert.notEqual(run(args).status, 0);
  assert.equal((await db.query("SELECT to_regclass('public.notifications') AS name")).rows[0].name, null);
  await db.query('DROP EVENT TRIGGER reject_notification_index; DROP FUNCTION reject_notification_index()');
  assert.deepEqual(await snapshot(), original);
  const applied = run(args); assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.deepEqual(await snapshot(), original);
  assert.deepEqual(await checkNotificationReadiness(db), []);
  assert.equal((await db.query('SELECT 1 FROM notifications')).rowCount, 0);
  assert.notEqual(run(args).status, 0);
  assert.deepEqual(await snapshot(), original);
  console.info('PASS 004: read-only preflight; wrong target and unexpected objects refused; mid-migration rollback; all eight existing tables preserved; constraints/indexes/privacy ready; repeat apply refused.');
} finally {
  await db?.end();
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
