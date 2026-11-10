// Rehearses the real migration CLI against a disposable, newly created local DB.
// Never connects to hosted PostgreSQL or resets an existing database.
import 'dotenv/config';
import pg from 'pg';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

if (process.env.NODE_ENV !== 'test' || !['127.0.0.1', 'localhost', '::1'].includes(process.env.DB_HOST)) {
  throw new Error('Migration rehearsal requires NODE_ENV=test and an isolated local PostgreSQL host.');
}
const database = `sdn_migration_${randomUUID().replaceAll('-', '')}_test`;
const connection = {
  host: process.env.DB_HOST, port: Number(process.env.DB_PORT),
  user: process.env.DB_USER, password: process.env.DB_PASSWORD,
  connectionTimeoutMillis: 5000
};
const admin = new pg.Client({ ...connection, database: process.env.DB_NAME });
let created = false;
let db;
const run = (args = []) => spawnSync(process.execPath, ['scripts/migrate-messaging.js', ...args], {
  env: { ...process.env, DB_NAME_TEST: database }, encoding: 'utf8', timeout: 45000
});
const tables = ['users', 'developer_profiles', 'skills', 'developer_skills', 'collaboration_requests', 'user_sessions'];
async function snapshot() {
  const result = [];
  for (const table of tables) {
    result.push((await db.query(`SELECT row_to_json(t) AS row FROM public.${table} t ORDER BY row_to_json(t)::text`)).rows);
  }
  return result;
}
try {
  await admin.connect();
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  db = new pg.Client({ ...connection, database });
  await db.connect();
  for (const file of ['001_initial_schema.sql', '002_session_table.sql']) {
    await db.query(await readFile(new URL(`../db/migrations/${file}`, import.meta.url), 'utf8'));
  }
  await db.query(`INSERT INTO users(display_name,email,password_hash) VALUES
      ('Release First','release-first@example.test','synthetic'),('Release Second','release-second@example.test','synthetic');
    INSERT INTO developer_profiles(user_id) VALUES (1),(2);
    INSERT INTO skills(name) VALUES ('Release Skill');
    INSERT INTO developer_skills(user_id,skill_id,skill_type) VALUES (1,1,'offered');
    INSERT INTO collaboration_requests(sender_id,recipient_id,status) VALUES (1,2,'accepted');
    INSERT INTO user_sessions(sid,sess,expire) VALUES ('synthetic-release','{}',now()+interval '1 day');`);
  const before = await snapshot();
  const preflight = run();
  assert.equal(preflight.status, 0, preflight.stdout + preflight.stderr);
  assert.equal((await db.query("SELECT to_regclass('public.conversations') AS table")).rows[0].table, null);
  assert.notEqual(run(['--apply', '--expected-host', 'wrong-host', '--expected-database', database]).status, 0);
  await db.query('CREATE FUNCTION public.messaging_guard_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$');
  const args = ['--apply', '--expected-host', connection.host, '--expected-database', database];
  assert.notEqual(run(args).status, 0);
  assert.equal((await db.query("SELECT to_regclass('public.conversations') AS table")).rows[0].table, null);
  assert.deepEqual(await snapshot(), before);
  await db.query('DROP FUNCTION public.messaging_guard_message()');
  const applied = run(args);
  assert.equal(applied.status, 0, applied.stdout + applied.stderr);
  assert.deepEqual(await snapshot(), before, 'Every original row must survive unchanged.');
  assert.equal((await db.query('SELECT count(*)::int AS count FROM messages')).rows[0].count, 0);
  await db.query('INSERT INTO conversations(collaboration_request_id) VALUES (1)');
  await db.query("INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES (1,1,'f95e569a-1215-492e-8840-f48d73cb8c90','Persisted migration rehearsal')");
  assert.notEqual(run(args).status, 0, 'Repeat apply must refuse.');
  assert.equal((await db.query('SELECT body FROM messages')).rows[0].body, 'Persisted migration rehearsal');
  const reader = new pg.Client({ ...connection, database });
  await reader.connect();
  try {
    assert.equal((await reader.query('SELECT body FROM messages')).rows[0].body, 'Persisted migration rehearsal');
  } finally { await reader.end(); }
  console.info('PASS: read-only preflight; wrong-target refusal; failed-migration rollback; all six original tables preserved; accepted connection works; repeat apply refuses; committed message persists across connections.');
} finally {
  await db?.end();
  // database is generated above and created by this invocation, never user input.
  if (created) await admin.query(`DROP DATABASE "${database}"`);
  await admin.end();
}
