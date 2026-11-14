import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { setTimeout as delay } from 'node:timers/promises';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';
import { checkNotificationReadiness } from '../../src/db/notificationReadiness.js';
import { acknowledgeAll } from '../../src/repositories/notifications.repository.js';
let hash, actors;
before(async () => { hash = await argon2.hash('notifications-test-password'); });
beforeEach(async () => {
  await resetTestDatabase();
  await testPool.query(`INSERT INTO users(display_name,email,password_hash) VALUES
    ('First Developer','notify1@example.test',$1),('Second Developer','notify2@example.test',$1),('Third Developer','notify3@example.test',$1)`, [hash]);
  await testPool.query('INSERT INTO developer_profiles(user_id) VALUES (1),(2),(3)');
  actors = [];
  for (const id of [1, 2, 3]) {
    const { agent } = createApi();
    await agent.post('/api/auth/login').send({ email: `notify${id}@example.test`, password: 'notifications-test-password' }).expect(200);
    const token = (await agent.get('/api/notifications/csrf-token').expect(200)).body.data.csrfToken;
    actors.push({ agent, id, token });
  }
});
after(() => testPool.end());
const post = (actor, path, body = {}) => actor.agent.post(path).set('X-CSRF-Token', actor.token).send(body);
const list = async (actor = actors[1], query = '') => (await actor.agent.get(`/api/notifications${query}`).expect(200)).body;
async function conversation(a = 1, b = 2) {
  const request = (await testPool.query("INSERT INTO collaboration_requests(sender_id,recipient_id,status) VALUES ($1,$2,'accepted') RETURNING id", [a, b])).rows[0];
  return (await post(actors[a - 1], '/api/conversations', { requestId: request.id }).expect(201)).body.data.id;
}
const send = (id, text = 'Private content 😀\nSecond line', uuid = randomUUID()) => post(actors[0], `/api/conversations/${id}/messages`, { body: text, clientMessageId: uuid });

test('notification endpoints require sessions, disable caching and enforce CSRF and ownership', async () => {
  const anonymous = createApi().agent;
  for (const route of ['', '/unread-count', '/csrf-token']) {
    assert.equal((await anonymous.get('/api/notifications' + route).expect(401)).headers['cache-control'], 'no-store');
  }
  await anonymous.post('/api/notifications/read-all').send({}).expect(401);
  const id = await conversation(); await send(id).expect(201);
  const item = (await list()).data[0];
  await actors[1].agent.post(`/api/notifications/${item.id}/read`).send({ lastMessageId: item.lastMessageId }).expect(403);
  await post(actors[2], `/api/notifications/${item.id}/read`, { lastMessageId: item.lastMessageId }).expect(404);
  await post(actors[2], '/api/notifications/999999/read', { lastMessageId: item.lastMessageId }).expect(404);
  assert.deepEqual((await list(actors[2])).data, []);
  assert.equal((await list()).meta.userId, 2);
  assert.ok(!JSON.stringify(await list()).includes('Private content'));
  assert.ok(!JSON.stringify(await list()).includes('@example.test'));
  await actors[1].agent.post('/api/notifications/read-all').set('X-CSRF-Token', actors[1].token).type('form').send({}).expect(415);
});

test('all collaboration types have the correct actors and recipients; duplicates do not notify', async () => {
  const created = (await actors[0].agent.post('/api/requests').send({ recipientId: 2 }).expect(201)).body.data;
  const received = (await list()).data[0];
  assert.equal(received.type, 'request_received'); assert.equal(received.actor.id, 1); assert.equal(received.requestId, created.id);
  await actors[0].agent.post('/api/requests').send({ recipientId: 2 }).expect(409);
  await actors[0].agent.post(`/api/requests/${created.id}/accept`).send({}).expect(403);
  await actors[1].agent.post(`/api/requests/${created.id}/accept`).send({}).expect(200);
  await actors[1].agent.post(`/api/requests/${created.id}/accept`).send({}).expect(409);
  const response = (await list(actors[0])).data[0];
  assert.equal(response.type, 'request_accepted'); assert.equal(response.actor.id, 2);
  const other = (await actors[0].agent.post('/api/requests').send({ recipientId: 3 }).expect(201)).body.data;
  await actors[2].agent.post(`/api/requests/${other.id}/reject`).send({}).expect(200);
  assert.deepEqual((await list(actors[0])).data.map(n => n.type), ['request_rejected', 'request_accepted']);
  assert.equal((await list()).data.length, 1);
});

test('message aggregation, concurrent sends, retry UUIDs and acknowledgement preserve counts', async () => {
  const id = await conversation(); const uuid = randomUUID();
  const first = (await send(id, 'Hello 😀\nAgain', uuid).expect(201)).body.data;
  await send(id, 'Hello 😀\nAgain', uuid).expect(200);
  await send(id, 'Changed', uuid).expect(409);
  await Promise.all(Array.from({ length: 6 }, (_, i) => send(id, `Message ${i}`).expect(201)));
  const result = await list(); const item = result.data[0];
  assert.equal(result.meta.unreadCount, 1); assert.equal(result.data.length, 1); assert.equal(item.eventCount, 7);
  assert.equal(item.actor.id, 1); assert.equal(item.conversationId, id);
  await post(actors[1], `/api/notifications/${item.id}/read`, { lastMessageId: first.id }).expect(409);
  await post(actors[1], `/api/notifications/${item.id}/read`, { lastMessageId: item.lastMessageId }).expect(200);
  await post(actors[1], `/api/notifications/${item.id}/read`, { lastMessageId: item.lastMessageId }).expect(200);
  await send(id, 'Next group').expect(201);
  const next = await list();
  assert.equal(next.data.length, 2); assert.equal(next.meta.unreadCount, 1); assert.equal(next.data[0].eventCount, 1);
  assert.notEqual(next.data[0].id, item.id); assert.ok(next.data[1].readAt);
  const bulk = (await post(actors[1], '/api/notifications/read-all').expect(200)).body;
  assert.equal(bulk.data.markedCount, 1); assert.equal(bulk.meta.unreadCount, 0);
  assert.equal((await post(actors[1], '/api/notifications/read-all').expect(200)).body.data.markedCount, 0);
});

test('invalid IDs, query cursors and recipient injection are rejected', async () => {
  for (const id of ['0', '-1', 'abc', '9223372036854775808']) await post(actors[0], `/api/notifications/${id}/read`, { lastMessageId: null }).expect(400);
  for (const query of ['?limit=0', '?limit=51', '?limit=1.2', '?cursor=bad', '?unread=maybe', '?recipientId=2']) await actors[0].agent.get('/api/notifications' + query).expect(400);
  await post(actors[0], '/api/notifications/read-all', { recipientId: 2 }).expect(400);
  await post(actors[0], '/api/notifications/1/read', {}).expect(400);
});

test('keyset pagination preserves microseconds and bigint identities and scopes unread filters', async () => {
  const id = await conversation();
  await testPool.query("SELECT setval(pg_get_serial_sequence('public.notifications','id'), 9007199254740992, true)");
  for (let i = 0; i < 3; i++) {
    await send(id, `Page ${i}`).expect(201);
    if (i < 2) await post(actors[1], '/api/notifications/read-all').expect(200);
  }
  await testPool.query(`UPDATE notifications SET last_event_at = '2026-01-01T00:00:00Z'::timestamptz + ((id - 9007199254740992)::int * interval '1 microsecond')`);
  const ids = []; let cursor;
  do { const result = await list(actors[1], '?limit=1' + (cursor ? `&cursor=${cursor}` : '')); ids.push(result.data[0].id); cursor = result.meta.nextCursor; } while (cursor);
  assert.equal(new Set(ids).size, 3); assert.ok(ids.every(id => typeof id === 'string' && BigInt(id) > 9007199254740992n));
  assert.equal((await list(actors[1], '?unread=true')).data.length, 1);
});

async function waitForBlockedNotificationUpdate() {
  for (let i = 0; i < 100; i++) {
    const result = await testPool.query("SELECT 1 FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND query LIKE '%UPDATE public.notifications%'");
    if (result.rowCount) return;
    await delay(10);
  }
  throw new Error('Expected notification update did not wait on the test lock.');
}

test('bulk acknowledgement preserves groups updated and rows created after its snapshot', async () => {
  const id = await conversation(); await send(id).expect(201);
  const writer = await testPool.connect(); let pending;
  try {
    await writer.query('BEGIN');
    const newMessage = (await writer.query(`INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ($1,1,$2,'Concurrent message') RETURNING id`, [id, randomUUID()])).rows[0].id;
    await writer.query('UPDATE notifications SET last_message_id=$1,event_count=event_count+1 WHERE recipient_id=2', [newMessage]);
    pending = acknowledgeAll(testPool, 2);
    await waitForBlockedNotificationUpdate();
    const requestId = (await writer.query('INSERT INTO collaboration_requests(sender_id,recipient_id) VALUES (3,2) RETURNING id')).rows[0].id;
    await writer.query("INSERT INTO notifications(recipient_id,actor_id,type,collaboration_request_id) VALUES (2,3,'request_received',$1)", [requestId]);
    await writer.query('COMMIT');
    assert.equal(await pending, 0);
    assert.equal((await list()).meta.unreadCount, 2);
  } finally { await writer.query('ROLLBACK'); writer.release(); await pending?.catch(() => {}); }
});

test('an acknowledgement waiting on a concurrent message does not clear the new activity', async () => {
  const id = await conversation(); await send(id).expect(201); const old = (await list()).data[0];
  const writer = await testPool.connect(); let pending;
  try {
    await writer.query('BEGIN');
    const messageId = (await writer.query("INSERT INTO messages(conversation_id,sender_id,client_message_id,body) VALUES ($1,1,$2,'New') RETURNING id", [id, randomUUID()])).rows[0].id;
    await writer.query('UPDATE notifications SET last_message_id=$1,event_count=2 WHERE id=$2', [messageId, old.id]);
    pending = post(actors[1], `/api/notifications/${old.id}/read`, { lastMessageId: old.lastMessageId }).then(response => response);
    await waitForBlockedNotificationUpdate(); await writer.query('COMMIT');
    assert.equal((await pending).status, 409); assert.equal((await list()).meta.unreadCount, 1);
  } finally { await writer.query('ROLLBACK'); writer.release(); await pending?.catch(() => {}); }
});

async function forceNotificationFailure(action) {
  await testPool.query('ALTER TABLE notifications ADD CONSTRAINT notifications_test_failure CHECK (false) NOT VALID');
  try { await action(); } finally { await testPool.query('ALTER TABLE notifications DROP CONSTRAINT notifications_test_failure'); }
}
test('notification failures roll back new messages and preserve retry UUID semantics', async () => {
  const id = await conversation(); const uuid = randomUUID();
  await forceNotificationFailure(async () => {
    await send(id, 'Retry me', uuid).expect(500);
    assert.equal((await testPool.query('SELECT 1 FROM messages')).rowCount, 0);
  });
  await send(id, 'Retry me', uuid).expect(201); await send(id, 'Retry me', uuid).expect(200);
  assert.equal((await list()).data[0].eventCount, 1);
});
test('notification failures roll back request creation and response transitions', async () => {
  await forceNotificationFailure(async () => {
    await actors[0].agent.post('/api/requests').send({ recipientId: 2 }).expect(500);
    assert.equal((await testPool.query('SELECT 1 FROM collaboration_requests')).rowCount, 0);
  });
  const id = (await actors[0].agent.post('/api/requests').send({ recipientId: 2 }).expect(201)).body.data.id;
  await forceNotificationFailure(async () => {
    await actors[1].agent.post(`/api/requests/${id}/accept`).send({}).expect(500);
    assert.equal((await testPool.query('SELECT status FROM collaboration_requests WHERE id=$1', [id])).rows[0].status, 'pending');
  });
  await actors[1].agent.post(`/api/requests/${id}/accept`).send({}).expect(200);
});

test('schema readiness, relationship guards, constraints and cascade deletion protect notification data', async () => {
  assert.deepEqual(await checkNotificationReadiness(testPool), []);
  const id = await conversation(); const message = (await send(id).expect(201)).body.data;
  await assert.rejects(testPool.query("INSERT INTO notifications(recipient_id,actor_id,type,conversation_id,last_message_id) VALUES (3,1,'message',$1,$2)", [id, message.id]), /invalid notification relationship/);
  await assert.rejects(testPool.query('UPDATE notifications SET event_count=0'), error => error.code === '23514');
  await assert.rejects(testPool.query("UPDATE notifications SET type='invented'"));
  await assert.rejects(testPool.query("INSERT INTO notifications(recipient_id,actor_id,type,conversation_id,last_message_id) VALUES (2,1,'message',$1,$2)", [id, message.id]), error => error.code === '23505');
  const client = await testPool.connect();
  try {
    await client.query('BEGIN'); await client.query('ALTER TABLE notifications DISABLE ROW LEVEL SECURITY');
    assert.ok((await checkNotificationReadiness(client)).includes('RLS disabled: notifications'));
  } finally { await client.query('ROLLBACK'); client.release(); }
  await testPool.query('DELETE FROM users WHERE id=1');
  assert.equal((await testPool.query('SELECT 1 FROM notifications')).rowCount, 0);
  assert.equal((await testPool.query('SELECT 1 FROM users')).rowCount, 2);
});

test('notification RLS and role revocations prevent direct Data API reads', async () => {
  const id = await conversation(); await send(id).expect(201);
  const roles = (await testPool.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')")).rows;
  for (const { rolname } of roles) {
    const client = await testPool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`GRANT USAGE ON SCHEMA public TO "${rolname}"`);
      await client.query(`SET LOCAL ROLE "${rolname}"`);
      await assert.rejects(client.query('SELECT * FROM public.notifications'), e => e.code === '42501');
    } finally { await client.query('ROLLBACK'); client.release(); }
  }
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    if (!roles.some(r => r.rolname === 'anon')) await client.query('CREATE ROLE anon NOLOGIN');
    await client.query('GRANT USAGE ON SCHEMA public TO anon; GRANT SELECT ON public.notifications TO anon');
    assert.ok((await checkNotificationReadiness(client)).includes('Notifications privileges exposed to Data API roles.'));
    await client.query('SET LOCAL ROLE anon');
    assert.equal((await client.query('SELECT * FROM public.notifications')).rowCount, 0);
  } finally { await client.query('ROLLBACK'); client.release(); }
});

test('concurrent request submissions and responses create one notification per successful event', async () => {
  const responses = await Promise.all([1,2].map(() => actors[0].agent.post('/api/requests').send({ recipientId: 2 })));
  assert.deepEqual(responses.map(r => r.status).sort(), [201,409]);
  const id = responses.find(r => r.status === 201).body.data.id;
  const decisions = await Promise.all(['accept','reject'].map(action => actors[1].agent.post(`/api/requests/${id}/${action}`).send({})));
  assert.deepEqual(decisions.map(r => r.status).sort(), [200,409]);
  assert.equal((await list()).data.length, 1); assert.equal((await list(actors[0])).data.length, 1);
  await actors[1].agent.post('/api/auth/logout').send({}).expect(200);
  await actors[1].agent.get('/api/notifications').expect(401);
  await post(actors[1], '/api/notifications/read-all').expect(401);
});
