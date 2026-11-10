// Storage contract only: messaging HTTP endpoints are implemented in step 3.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import env from '../../src/config/env.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';

beforeEach(async () => {
  await resetTestDatabase();
  await testPool.query(`INSERT INTO users (display_name, email, password_hash) VALUES
    ('First Developer', 'first@example.test', 'fixture-hash'),
    ('Second Developer', 'second@example.test', 'fixture-hash'),
    ('Third Developer', 'third@example.test', 'fixture-hash')`);
  await testPool.query('INSERT INTO developer_profiles (user_id) VALUES (1), (2), (3)');
});
after(() => testPool.end());

async function createRequest(status = 'accepted', sender = 1, recipient = 2) {
  const result = await testPool.query(
    'INSERT INTO collaboration_requests (sender_id, recipient_id, status) VALUES ($1, $2, $3) RETURNING id',
    [sender, recipient, status]
  );
  return result.rows[0].id;
}

async function openConversation(requestId) {
  const result = await testPool.query(
    'INSERT INTO conversations (collaboration_request_id) VALUES ($1) RETURNING *', [requestId]
  );
  return result.rows[0];
}

async function send(conversationId, senderId = 1, body = 'Let us arrange our first session.', clientId = randomUUID(), db = testPool) {
  const result = await db.query(
    'INSERT INTO messages (conversation_id, sender_id, body, client_message_id) VALUES ($1, $2, $3, $4) RETURNING *',
    [conversationId, senderId, body, clientId]
  );
  return result.rows[0];
}

const hasCode = (code) => (error) => error.code === code;
const hasConstraint = (constraint) => (error) => error.constraint === constraint;

test('conversations open only for accepted requests, including previously accepted connections', async () => {
  const pending = await createRequest('pending');
  const rejected = await createRequest('rejected', 1, 3);
  await assert.rejects(openConversation(pending), hasConstraint('conversations_accepted_request_required'));
  await assert.rejects(openConversation(rejected), hasConstraint('conversations_accepted_request_required'));
  await testPool.query("UPDATE collaboration_requests SET status = 'accepted' WHERE id = $1", [pending]);
  const conversation = await openConversation(pending);
  assert.equal(conversation.collaboration_request_id, pending);
  assert.ok(conversation.created_at instanceof Date);
  await assert.rejects(openConversation(2147483647), hasConstraint('conversations_request_fk'));
});

test('simultaneous conversation creation cannot duplicate an accepted connection', async () => {
  const requestId = await createRequest();
  const results = await Promise.allSettled([openConversation(requestId), openConversation(requestId)]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.constraint, 'conversations_request_key');
  assert.equal((await testPool.query('SELECT count(*)::integer AS count FROM conversations')).rows[0].count, 1);
});

test('conversations cannot be reassigned to another connection or have their identity changed', async () => {
  const conversation = await openConversation(await createRequest());
  const otherRequest = await createRequest('accepted', 1, 3);
  await assert.rejects(testPool.query(
    'UPDATE conversations SET collaboration_request_id = $1 WHERE id = $2', [otherRequest, conversation.id]
  ), hasConstraint('conversations_immutable'));
  await assert.rejects(testPool.query('UPDATE conversations SET id = 100 WHERE id = $1', [conversation.id]), hasCode('428C9'));
  await assert.rejects(testPool.query('UPDATE conversations SET id = DEFAULT WHERE id = $1', [conversation.id]), hasConstraint('conversations_immutable'));
  await assert.rejects(testPool.query("UPDATE conversations SET created_at = created_at + interval '1 day' WHERE id = $1", [conversation.id]), hasConstraint('conversations_immutable'));
});

test('both participants can send plain text with stable bigint ids and server timestamps', async () => {
  const conversation = await openConversation(await createRequest());
  const first = await send(conversation.id, 1, 'Hello\nCan we learn PostgreSQL?');
  const second = await send(conversation.id, 2, 'Yes! <b>This stays text.</b>');
  assert.equal(typeof first.id, 'string');
  assert.ok(BigInt(second.id) > BigInt(first.id));
  assert.equal(first.body, 'Hello\nCan we learn PostgreSQL?');
  assert.equal(second.body, 'Yes! <b>This stays text.</b>');
  assert.ok(first.created_at instanceof Date);
  assert.equal(second.sender_id, 2);
});

test('messages reject nonparticipants, absent senders, and nonexistent conversations', async () => {
  const conversation = await openConversation(await createRequest());
  await assert.rejects(send(conversation.id, 3), hasConstraint('messages_sender_is_participant'));
  await assert.rejects(send(conversation.id, 2147483647), hasConstraint('messages_sender_is_participant'));
  await assert.rejects(send(conversation.id, null), hasCode('23502'));
  await assert.rejects(send(2147483647), hasConstraint('messages_conversation_fk'));
});

test('messages require nonblank text of at most 2000 PostgreSQL characters', async () => {
  const conversation = await openConversation(await createRequest());
  for (const body of ['', ' ', '\t\r\n ', 'a'.repeat(2001)]) {
    await assert.rejects(send(conversation.id, 1, body), hasCode('23514'));
  }
  await assert.rejects(send(conversation.id, 1, null), hasCode('23502'));
  assert.equal((await send(conversation.id, 1, 'a'.repeat(2000))).body.length, 2000);
  assert.equal((await send(conversation.id, 1, '😀'.repeat(2000))).body, '😀'.repeat(2000));
});

test('concurrent retries with the same client UUID create only one message', async () => {
  const conversation = await openConversation(await createRequest());
  const clientId = randomUUID();
  const results = await Promise.allSettled([
    send(conversation.id, 1, 'Same send', clientId),
    send(conversation.id, 1, 'Same send', clientId)
  ]);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  assert.equal(results.find((result) => result.status === 'rejected').reason.constraint, 'messages_client_message_key');
  assert.equal((await testPool.query('SELECT count(*)::integer AS count FROM messages')).rows[0].count, 1);
  await assert.rejects(send(conversation.id, 1, 'Changed body', clientId), hasConstraint('messages_client_message_key'));
  assert.equal((await testPool.query('SELECT body FROM messages')).rows[0].body, 'Same send');
  // Independent sends by the other participant cannot consume this sender's key.
  await send(conversation.id, 2, 'Independent send', clientId);
});

test('retry identifiers must be nonnull UUIDs', async () => {
  const conversation = await openConversation(await createRequest());
  await assert.rejects(send(conversation.id, 1, 'Hello', null), hasCode('23502'));
  await assert.rejects(send(conversation.id, 1, 'Hello', 'invalid'), hasCode('22P02'));
});

test('saved messages cannot be edited, reassigned, or have timestamps replaced', async () => {
  const conversation = await openConversation(await createRequest());
  const other = await openConversation(await createRequest('accepted', 1, 3));
  const message = await send(conversation.id);
  const changes = [
    ["body = 'changed'", []],
    ['sender_id = 2', []],
    ['conversation_id = $2', [other.id]],
    ['client_message_id = $2', [randomUUID()]],
    ["created_at = created_at + interval '1 day'", []],
    ['id = DEFAULT', []]
  ];
  for (const [assignment, values] of changes) {
    await assert.rejects(testPool.query(`UPDATE messages SET ${assignment} WHERE id = $1`, [message.id, ...values]), hasConstraint('messages_immutable'));
  }
  await assert.rejects(testPool.query('UPDATE messages SET id = 1000 WHERE id = $1', [message.id]), hasCode('428C9'));
});

test('message history paginates deterministically and stays within its conversation', async () => {
  const conversation = await openConversation(await createRequest());
  const other = await openConversation(await createRequest('accepted', 1, 3));
  const ids = [];
  for (let index = 0; index < 5; index += 1) ids.push((await send(conversation.id, 1, `Message ${index}`)).id);
  await send(other.id, 3, 'Other conversation');
  const firstPage = await testPool.query('SELECT id FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT 3', [conversation.id]);
  const secondPage = await testPool.query('SELECT id FROM messages WHERE conversation_id = $1 AND id < $2 ORDER BY id DESC LIMIT 3', [conversation.id, firstPage.rows.at(-1).id]);
  assert.deepEqual([...firstPage.rows, ...secondPage.rows].map((row) => row.id), ids.reverse());
});

test('messages persist across separate database connections', async () => {
  const conversation = await openConversation(await createRequest());
  const connection = {
    host: env.database.host, port: env.database.port, database: env.database.name,
    user: env.database.user, password: env.database.password
  };
  const writer = new pg.Client(connection);
  await writer.connect();
  let saved;
  try { saved = await send(conversation.id, 1, 'Persistent message', randomUUID(), writer); }
  finally { await writer.end(); }
  const reader = new pg.Client(connection);
  await reader.connect();
  try {
    assert.equal((await reader.query('SELECT body FROM messages WHERE id = $1', [saved.id])).rows[0].body, 'Persistent message');
    assert.equal((await reader.query('SELECT current_database() AS name')).rows[0].name, env.database.testName);
  } finally { await reader.end(); }
});

test('deleting a connection cascades its conversation and messages without affecting other connections', async () => {
  const requestId = await createRequest();
  const conversation = await openConversation(requestId);
  const other = await openConversation(await createRequest('accepted', 1, 3));
  await send(conversation.id);
  await send(other.id);
  await testPool.query('DELETE FROM collaboration_requests WHERE id = $1', [requestId]);
  assert.deepEqual((await testPool.query('SELECT id FROM conversations')).rows.map((row) => row.id), [other.id]);
  assert.deepEqual((await testPool.query('SELECT conversation_id FROM messages')).rows.map((row) => row.conversation_id), [other.id]);
});

test('deleting a participant removes the complete conversation including the other participant messages', async () => {
  const conversation = await openConversation(await createRequest());
  await send(conversation.id, 1);
  await send(conversation.id, 2);
  await testPool.query('DELETE FROM users WHERE id = 1');
  assert.equal((await testPool.query('SELECT * FROM conversations')).rowCount, 0);
  assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 0);
  assert.equal((await testPool.query('SELECT * FROM users')).rowCount, 2);
});

test('messaging tables enable RLS with no client policies and revoke PUBLIC object privileges', async () => {
  const tables = await testPool.query("SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.conversations'::regclass, 'public.messages'::regclass) ORDER BY relname");
  assert.equal(tables.rowCount, 2);
  assert.ok(tables.rows.every((row) => row.relrowsecurity));
  assert.equal((await testPool.query("SELECT * FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('conversations', 'messages')")).rowCount, 0);
  const publicGrants = await testPool.query(`SELECT c.relname FROM pg_class c,
    LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::\"char\" ELSE 'r'::\"char\" END, c.relowner))) a
    WHERE c.oid IN ('public.conversations'::regclass, 'public.messages'::regclass,
      pg_get_serial_sequence('public.conversations', 'id')::regclass, pg_get_serial_sequence('public.messages', 'id')::regclass)
    AND a.grantee = 0`);
  assert.equal(publicGrants.rowCount, 0);
  const functions = await testPool.query(`SELECT p.prosecdef, a.grantee FROM pg_proc p
    LEFT JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a ON a.grantee = 0
    WHERE p.oid IN ('public.messaging_guard_conversation()'::regprocedure, 'public.messaging_guard_message()'::regprocedure)`);
  assert.equal(functions.rowCount, 2);
  assert.ok(functions.rows.every((row) => !row.prosecdef && row.grantee === null));
});

test('Supabase API roles cannot read, write, or use messaging identity sequences and functions', async (context) => {
  const roles = await testPool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') ORDER BY rolname");
  if (!roles.rowCount) return context.skip('Run with local Supabase-role fixtures to exercise inherited-grant protection.');
  for (const { rolname } of roles.rows) {
    const permissions = await testPool.query(`SELECT
      has_table_privilege($1, 'public.conversations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS conversations,
      has_table_privilege($1, 'public.messages', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS messages,
      has_sequence_privilege($1, pg_get_serial_sequence('public.conversations', 'id'), 'USAGE,SELECT,UPDATE') AS conversation_sequence,
      has_sequence_privilege($1, pg_get_serial_sequence('public.messages', 'id'), 'USAGE,SELECT,UPDATE') AS message_sequence,
      has_function_privilege($1, 'public.messaging_guard_conversation()', 'EXECUTE') AS conversation_function,
      has_function_privilege($1, 'public.messaging_guard_message()', 'EXECUTE') AS message_function`, [rolname]);
    assert.ok(Object.values(permissions.rows[0]).every((allowed) => allowed === false), rolname);
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      // rolname comes only from the fixed three-role allowlist above.
      await client.query(`SET LOCAL ROLE "${rolname}"`);
      await assert.rejects(client.query('SELECT * FROM public.messages'), hasCode('42501'));
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
});

test('RLS still hides messages if a client role accidentally receives SELECT permission later', async (context) => {
  if (!(await testPool.query("SELECT 1 FROM pg_roles WHERE rolname = 'anon'")).rowCount) {
    return context.skip('Run with local Supabase-role fixtures to exercise RLS defense.');
  }
  const conversation = await openConversation(await createRequest());
  await send(conversation.id);
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('GRANT SELECT ON public.conversations, public.messages TO anon');
    await client.query('SET LOCAL ROLE anon');
    assert.equal((await client.query('SELECT * FROM public.conversations')).rowCount, 0);
    assert.equal((await client.query('SELECT * FROM public.messages')).rowCount, 0);
  } finally { await client.query('ROLLBACK'); client.release(); }
});
