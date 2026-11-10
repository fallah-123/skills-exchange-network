import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import argon2 from 'argon2';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';
import { CHAT_SEND_LIMIT } from '../../src/constants.js';

let hash;
let actors;
before(async () => { hash = await argon2.hash('messaging-test-password'); });
beforeEach(async () => {
  await resetTestDatabase();
  await testPool.query(`INSERT INTO users(display_name,email,password_hash) VALUES
    ('First Developer','chat1@example.test',$1), ('Second Developer','chat2@example.test',$1),
    ('Third Developer','chat3@example.test',$1)`, [hash]);
  await testPool.query('INSERT INTO developer_profiles(user_id) VALUES (1),(2),(3)');
  actors = await Promise.all([1, 2, 3].map(signIn));
});
after(() => testPool.end());

async function signIn(id) {
  const { agent } = createApi();
  await agent.post('/api/auth/login').send({ email: `chat${id}@example.test`, password: 'messaging-test-password' }).expect(200);
  const response = await agent.get('/api/conversations/csrf-token').expect(200);
  return { agent, token: response.body.data.csrfToken, id };
}
function post(actor, path, fields) {
  return actor.agent.post(path).set('X-CSRF-Token', actor.token).send(fields);
}
async function connection(sender = 1, recipient = 2, status = 'accepted') {
  return (await testPool.query('INSERT INTO collaboration_requests(sender_id,recipient_id,status) VALUES ($1,$2,$3) RETURNING id', [sender, recipient, status])).rows[0].id;
}
async function open(actor = actors[0], requestId) {
  const response = await post(actor, '/api/conversations', { requestId: requestId ?? await connection() }).expect(201);
  return response.body.data;
}
function send(actor, id, body = 'Hello', clientMessageId = randomUUID()) {
  return post(actor, `/api/conversations/${id}/messages`, { body, clientMessageId });
}
async function seedMessages(id, count, senderId = 1, ageSeconds = 0) {
  await testPool.query(`INSERT INTO messages(conversation_id,sender_id,client_message_id,body,created_at)
    SELECT $1,$2,uuid,'Seeded message',clock_timestamp()-($4::integer * interval '1 second') FROM unnest($3::uuid[]) uuid`,
  [id, senderId, Array.from({ length: count }, () => randomUUID()), ageSeconds]);
}

test('all conversation endpoints require a session and responses disable caching', async () => {
  const { agent } = createApi();
  for (const path of ['/api/conversations', '/api/conversations/csrf-token', '/api/conversations/1', '/api/conversations/1/messages']) {
    const response = await agent.get(path).expect(401);
    assert.equal(response.body.error.code, 'UNAUTHENTICATED');
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  await agent.post('/api/conversations').send({ requestId: 1 }).expect(401);
  await agent.post('/api/conversations/1/messages').send({ body: 'Hello', clientMessageId: randomUUID() }).expect(401);
});

test('writes require a valid token bound to the current session', async () => {
  const requestId = await connection();
  const first = actors[0];
  const again = await first.agent.get('/api/conversations/csrf-token').expect(200);
  assert.equal(again.body.data.csrfToken, first.token);
  assert.equal(again.body.data.userId, first.id);
  assert.equal(again.headers['cache-control'], 'no-store');
  for (const token of ['', 'invalid', actors[1].token]) {
    const response = await first.agent.post('/api/conversations').set('X-CSRF-Token', token).send({ requestId }).expect(403);
    assert.equal(response.body.error.code, 'CSRF_INVALID');
  }
  const conversation = await open(first, requestId);
  await first.agent.post(`/api/conversations/${conversation.id}/messages`).send({ body: 'Missing token', clientMessageId: randomUUID() }).expect(403);
  assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 0);
});

test('messaging rejects non-JSON and oversized bodies and permits the CSRF header in the configured CORS preflight', async () => {
  const response = await actors[0].agent.post('/api/conversations').set('X-CSRF-Token', actors[0].token).type('form').send({ requestId: 1 }).expect(415);
  assert.equal(response.body.error.code, 'UNSUPPORTED_MEDIA_TYPE');
  const oversized = await post(actors[0], '/api/conversations/1/messages', { body: 'a'.repeat(11_000), clientMessageId: randomUUID() }).expect(413);
  assert.equal(oversized.body.error.code, 'PAYLOAD_TOO_LARGE');
  const preflight = await actors[0].agent.options('/api/conversations')
    .set('Origin', 'https://frontend-eta-fawn-j8xf3k2cfw.vercel.app')
    .set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'Content-Type,X-CSRF-Token').expect(204);
  assert.match(preflight.headers['access-control-allow-headers'], /X-CSRF-Token/i);
  const crossOrigin = await actors[0].agent.get('/api/conversations/csrf-token')
    .set('Origin', 'https://frontend-eta-fawn-j8xf3k2cfw.vercel.app').expect(200);
  assert.match(crossOrigin.headers['access-control-expose-headers'], /Retry-After/i);
});

test('only participants in an accepted request can open its conversation', async () => {
  const pending = await connection(1, 2, 'pending');
  const rejected = await connection(1, 3, 'rejected');
  for (const requestId of [pending, rejected]) {
    const response = await post(actors[0], '/api/conversations', { requestId }).expect(409);
    assert.equal(response.body.error.code, 'CONNECTION_NOT_ACCEPTED');
  }
  const accepted = await connection(2, 3);
  const hidden = await post(actors[0], '/api/conversations', { requestId: accepted }).expect(404);
  const missing = await post(actors[0], '/api/conversations', { requestId: 2147483647 }).expect(404);
  assert.deepEqual(hidden.body, missing.body);
  assert.equal((await testPool.query('SELECT * FROM conversations')).rowCount, 0);
});

test('both participants opening a conversation concurrently share one record', async () => {
  const requestId = await connection();
  const responses = await Promise.all(actors.slice(0, 2).map((actor) => post(actor, '/api/conversations', { requestId })));
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  assert.equal(responses[0].body.data.id, responses[1].body.data.id);
  assert.equal(responses[0].body.data.counterpart.id, 2);
  assert.equal(responses[1].body.data.counterpart.id, 1);
  assert.equal(responses[0].body.data.lastMessage, null);
  await post(actors[0], '/api/conversations', { requestId }).expect(200);
  assert.equal((await testPool.query('SELECT * FROM conversations')).rowCount, 1);
});

test('third parties cannot view, list, or send to a conversation by guessing its ID', async () => {
  const conversation = await open();
  await send(actors[0], conversation.id, 'Private text').expect(201);
  for (const suffix of ['', '/messages']) {
    const hidden = await actors[2].agent.get(`/api/conversations/${conversation.id}${suffix}`).expect(404);
    const missing = await actors[2].agent.get(`/api/conversations/2147483647${suffix}`).expect(404);
    assert.deepEqual(hidden.body, missing.body);
  }
  await send(actors[2], conversation.id).expect(404);
  assert.deepEqual((await actors[2].agent.get('/api/conversations').expect(200)).body.data, []);
  assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 1);
});

test('conversation inboxes are participant-scoped, paginated, and ordered by latest activity', async () => {
  const first = await open();
  const second = await open(actors[0], await connection(1, 3));
  await open(actors[1], await connection(2, 3));
  await send(actors[0], second.id, 'Older activity').expect(201);
  await send(actors[1], first.id, 'Newest activity').expect(201);
  const page1 = await actors[0].agent.get('/api/conversations?limit=1').expect(200);
  assert.equal(page1.body.data[0].id, first.id);
  assert.equal(page1.body.data[0].lastMessage.body, 'Newest activity');
  assert.deepEqual(page1.body.meta, { page: 1, limit: 1, hasMore: true });
  const page2 = await actors[0].agent.get('/api/conversations?limit=1&page=2').expect(200);
  assert.equal(page2.body.data[0].id, second.id);
  assert.equal(page2.body.meta.hasMore, false);
  const detail = await actors[0].agent.get(`/api/conversations/${first.id}`).expect(200);
  assert.deepEqual(detail.body.data, page1.body.data[0]);
  assert.equal(JSON.stringify(detail.body).includes('email'), false);
  assert.equal(JSON.stringify(detail.body).includes('password'), false);
});

test('messages use the session sender, preserve plain text, and validate body and identity claims', async () => {
  const conversation = await open();
  const response = await send(actors[1], conversation.id, '  <script>plain text</script>\nHello  ').expect(201);
  assert.equal(response.body.data.senderId, 2);
  assert.equal(response.body.data.body, '<script>plain text</script>\nHello');
  assert.equal(typeof response.body.data.id, 'string');
  assert.ok(Number.isFinite(Date.parse(response.body.data.createdAt)));
  await actors[0].agent.post(`/api/conversations/${conversation.id}/messages`).set('X-CSRF-Token', actors[0].token).type('json').send('null').expect(400);
  for (const body of [[], {}, { body: 'Hello', clientMessageId: 'bad' },
    { body: 'Hello', clientMessageId: randomUUID(), senderId: 2 },
    { body: 'Hello', clientMessageId: randomUUID(), createdAt: '2000-01-01' },
    { body: ' \t\n', clientMessageId: randomUUID() },
    { body: '\uD800', clientMessageId: randomUUID() }, { body: 'a\0b', clientMessageId: randomUUID() }]) {
    await post(actors[0], `/api/conversations/${conversation.id}/messages`, body).expect(400);
  }
  await send(actors[0], conversation.id, '😀'.repeat(2000)).expect(201);
  await send(actors[0], conversation.id, 'a'.repeat(2001)).expect(400);
  assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 2);
});

test('same-send retries return the original message across sessions and reject changed text', async () => {
  const conversation = await open();
  const secondSession = await signIn(1);
  const clientId = randomUUID();
  const responses = await Promise.all([send(actors[0], conversation.id, 'Retry safely', clientId), send(secondSession, conversation.id, 'Retry safely', clientId)]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
  assert.deepEqual(responses[0].body.data, responses[1].body.data);
  assert.equal(responses.find((response) => response.status === 200).body.meta.replayed, true);
  const conflict = await send(actors[0], conversation.id, 'Different text', clientId).expect(409);
  assert.equal(conflict.body.error.code, 'MESSAGE_ID_REUSED');
  assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 1);
});

test('history and incremental reads paginate chronologically without crossing conversations', async () => {
  const conversation = await open();
  const other = await open(actors[0], await connection(1, 3));
  const ids = [];
  for (let index = 0; index < 5; index += 1) ids.push((await send(actors[0], conversation.id, `Message ${index}`).expect(201)).body.data.id);
  await send(actors[0], other.id, 'Other conversation').expect(201);
  const initial = await actors[1].agent.get(`/api/conversations/${conversation.id}/messages?limit=2`).expect(200);
  assert.deepEqual(initial.body.data.map((row) => row.id), ids.slice(3));
  assert.equal(initial.body.meta.nextAfter, ids[4]);
  const older = await actors[1].agent.get(`/api/conversations/${conversation.id}/messages?limit=2&before=${initial.body.meta.nextBefore}`).expect(200);
  assert.deepEqual(older.body.data.map((row) => row.id), ids.slice(1, 3));
  assert.equal(older.body.meta.nextAfter, null);
  const oldest = await actors[1].agent.get(`/api/conversations/${conversation.id}/messages?limit=2&before=${older.body.meta.nextBefore}`).expect(200);
  assert.deepEqual(oldest.body.data.map((row) => row.id), ids.slice(0, 1));
  assert.equal(oldest.body.meta.hasMore, false);
  const polled = [];
  let after = '0';
  let response;
  do {
    response = await actors[1].agent.get(`/api/conversations/${conversation.id}/messages?after=${after}&limit=2`).expect(200);
    polled.push(...response.body.data.map((row) => row.id));
    after = response.body.meta.nextAfter;
  } while (response.body.meta.hasMore);
  assert.deepEqual(polled, ids);
  const empty = await actors[1].agent.get(`/api/conversations/${conversation.id}/messages?after=${after}`).expect(200);
  assert.deepEqual(empty.body.data, []);
  assert.equal(empty.body.meta.nextAfter, after);
});

test('bigint message IDs and cursors retain precision beyond JavaScript safe integers', async () => {
  const conversation = await open();
  await testPool.query("SELECT setval(pg_get_serial_sequence('public.messages','id'), 9007199254740992, true)");
  const first = (await send(actors[0], conversation.id).expect(201)).body.data;
  const second = (await send(actors[1], conversation.id).expect(201)).body.data;
  assert.equal(first.id, '9007199254740993');
  assert.equal(second.id, '9007199254740994');
  const response = await actors[0].agent.get(`/api/conversations/${conversation.id}/messages?after=${first.id}`).expect(200);
  assert.deepEqual(response.body.data.map((row) => row.id), [second.id]);
});

test('malformed IDs, cursor bounds, and repeated query parameters return validation errors', async () => {
  const conversation = await open();
  for (const query of ['before=0', 'after=-1', 'after=9223372036854775808', 'after=01', 'after=1&after=2', 'after[x]=1', 'before=2&after=1', 'limit=101', 'limit=0']) {
    await actors[0].agent.get(`/api/conversations/${conversation.id}/messages?${query}`).expect(400);
  }
  for (const query of ['page=0', 'page=10001', 'limit=51', 'page=1&page=2']) await actors[0].agent.get(`/api/conversations?${query}`).expect(400);
  for (const id of ['0', '-1', '2147483648', 'abc']) await actors[0].agent.get(`/api/conversations/${id}`).expect(400);
  for (const requestId of ['1', 0, -1, 2147483648]) await post(actors[0], '/api/conversations', { requestId }).expect(400);
});

test('logout invalidates chat access and the next login requires its new CSRF token', async () => {
  const conversation = await open();
  const actor = actors[0];
  await actor.agent.post('/api/auth/logout').expect(200);
  await actor.agent.get(`/api/conversations/${conversation.id}/messages`).expect(401);
  await send(actor, conversation.id).expect(401);
  await actor.agent.post('/api/auth/login').send({ email: 'chat1@example.test', password: 'messaging-test-password' }).expect(200);
  await send(actor, conversation.id).expect(403);
  const token = await actor.agent.get('/api/conversations/csrf-token').expect(200);
  assert.notEqual(token.body.data.csrfToken, actor.token);
  actor.token = token.body.data.csrfToken;
  await send(actor, conversation.id).expect(201);
});

test('expired server-side sessions cannot fetch tokens, read messages, or send messages', async () => {
  const conversation = await open();
  await testPool.query("UPDATE user_sessions SET expire = now() - interval '1 minute'");
  await actors[0].agent.get('/api/conversations/csrf-token').expect(401);
  await actors[0].agent.get(`/api/conversations/${conversation.id}/messages`).expect(401);
  await send(actors[0], conversation.id).expect(401);
  assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 0);
});

test('send limits span conversations and sessions, allow retries, and do not throttle the other participant', async () => {
  const first = await open();
  const second = await open(actors[0], await connection(1, 3));
  await seedMessages(first.id, CHAT_SEND_LIMIT - 1);
  const otherSession = await signIn(1);
  const responses = await Promise.all([send(actors[0], first.id, 'Last allowed send'), send(otherSession, second.id, 'Last allowed send')]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 429]);
  const limited = responses.find((response) => response.status === 429);
  assert.equal(limited.body.error.code, 'MESSAGE_RATE_LIMITED');
  assert.ok(Number(limited.headers['retry-after']) >= 1 && Number(limited.headers['retry-after']) <= 60);
  const saved = responses.find((response) => response.status === 201).body.data;
  await send(otherSession, saved.conversationId, saved.body, saved.clientMessageId).expect(200);
  await send(actors[1], first.id, 'Other participant may reply').expect(201);
  assert.equal((await testPool.query('SELECT count(*)::integer AS count FROM messages WHERE sender_id=1')).rows[0].count, CHAT_SEND_LIMIT);
});

test('messages outside the send window do not consume the current allowance', async () => {
  const conversation = await open();
  await seedMessages(conversation.id, CHAT_SEND_LIMIT + 1, 1, 61);
  await send(actors[0], conversation.id, 'New window').expect(201);
});

test('a blocked send cannot commit a later ID ahead of an earlier message in its conversation', async () => {
  const conversation = await open();
  const writer = await testPool.connect();
  let pending;
  try {
    await writer.query('BEGIN');
    await writer.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE', [conversation.id]);
    const earlier = await writer.query("INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ($1,1,$2,'Earlier transaction') RETURNING id", [conversation.id, randomUUID()]);
    pending = send(actors[1], conversation.id, 'Later transaction').then((response) => response);
    let blocked = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const state = await testPool.query("SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%FOR UPDATE OF c%'");
      if (state.rowCount) { blocked = true; break; }
      await delay(20);
    }
    assert.equal(blocked, true, 'The API must lock the conversation before inserting.');
    const during = await actors[0].agent.get(`/api/conversations/${conversation.id}/messages?after=0`).expect(200);
    assert.deepEqual(during.body.data, []);
    await writer.query('COMMIT');
    const later = await pending;
    assert.equal(later.status, 201);
    const history = await actors[0].agent.get(`/api/conversations/${conversation.id}/messages?after=0`).expect(200);
    assert.deepEqual(history.body.data.map((row) => row.id), [earlier.rows[0].id, later.body.data.id]);
  } finally {
    await writer.query('ROLLBACK');
    writer.release();
    if (pending) await pending;
  }
});

test('lock contention returns a retryable response and leaves no partial message', async () => {
  const conversation = await open();
  const writer = await testPool.connect();
  try {
    await writer.query('BEGIN');
    await writer.query('SELECT id FROM conversations WHERE id=$1 FOR UPDATE', [conversation.id]);
    const response = await send(actors[0], conversation.id, 'Retry after contention').expect(503);
    assert.equal(response.body.error.code, 'MESSAGING_BUSY');
    assert.equal(response.headers['retry-after'], '1');
    assert.equal((await testPool.query('SELECT * FROM messages')).rowCount, 0);
  } finally { await writer.query('ROLLBACK'); writer.release(); }
});
