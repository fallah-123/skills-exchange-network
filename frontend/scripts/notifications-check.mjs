// Real frontend modules -> local Vite proxy -> Express -> isolated PostgreSQL.
// Creates synthetic records only; never resets or deletes existing data.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { registerUser, loginUser, logoutUser } from '../src/api/auth.api.js';
import { createRequest, respondToRequest } from '../src/api/requests.api.js';
import { openConversation, sendMessage, listMessages } from '../src/api/messaging.api.js';
import * as notifications from '../src/api/notifications.api.js';
import { createNotificationStore } from '../src/utils/notificationStore.js';
import { notificationPath } from '../src/utils/notifications.js';

if (process.env.INTEGRATION_TARGET_IS_TEST_DB !== 'yes') throw new Error('Confirm the proxy targets an isolated test backend with INTEGRATION_TARGET_IS_TEST_DB=yes.');
const origin = new URL(process.env.INTEGRATION_ORIGIN || 'http://127.0.0.1:5175');
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.username || origin.password) throw new Error('Only a local HTTP origin is allowed.');
const nativeFetch = globalThis.fetch;
const scope = new AsyncLocalStorage();
const cookies = new Map();
globalThis.fetch = async (path, options = {}) => {
  assert.ok(typeof path === 'string' && path.startsWith('/api/'));
  const actor = scope.getStore();
  assert.ok(actor, 'A distinct test session is required.');
  const headers = new Headers(options.headers);
  if (cookies.has(actor)) headers.set('Cookie', cookies.get(actor));
  const result = await nativeFetch(new URL(path, origin), { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  for (const cookie of result.headers.getSetCookie()) cookies.set(actor, cookie.split(';')[0]);
  return result;
};
const as = (actor, action) => scope.run(actor, action);
const accounts = {};
const stamp = randomUUID();
const password = `Local-${randomUUID()}!`;
let store;
async function until(predicate, timeout = 10000) {
  const end = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Expected notification state did not arrive before the deadline.');
    await delay(50);
  }
}
try {
  for (const actor of ['a', 'b', 'c']) {
    const email = `notification-${stamp}-${actor}@example.test`;
    const user = (await as(actor, () => registerUser({ displayName: `Notification Demo ${actor.toUpperCase()}`, email, password }))).data;
    accounts[actor] = { ...user, email };
    await as(actor, () => loginUser({ email, password }));
  }
  const list = actor => as(actor, () => notifications.listNotifications(accounts[actor].id));
  const incoming = (await as('a', () => createRequest(accounts.b.id, 'Local notification demonstration'))).data;
  const requestNotice = (await list('b')).data[0];
  assert.equal(requestNotice.type, 'request_received');
  assert.equal(requestNotice.actor.id, accounts.a.id);
  assert.equal(notificationPath(requestNotice), `/requests?tab=incoming&requestId=${incoming.id}`);
  await as('b', () => respondToRequest(incoming.id, 'accept'));
  const accepted = (await list('a')).data[0];
  assert.equal(accepted.type, 'request_accepted');
  assert.equal(notificationPath(accepted), `/requests?tab=outgoing&requestId=${incoming.id}`);
  const rejected = (await as('a', () => createRequest(accounts.c.id, 'Local rejection scenario'))).data;
  await as('c', () => respondToRequest(rejected.id, 'reject'));
  assert.equal((await list('a')).data[0].type, 'request_rejected');
  console.log('PASS received, accepted and rejected request notifications and deep-link targets');

  await as('b', () => notifications.markAllNotificationsRead(accounts.b.id));
  // Node has no DOM. Supply a visible/online lifecycle; fetch and timers remain real.
  const environment = { document: Object.assign(new EventTarget(), { visibilityState: 'visible' }), window: new EventTarget(), navigator: { onLine: true } };
  store = createNotificationStore({ userId: accounts.b.id, environment, onChange() {}, api: {
    list: (...args) => as('b', () => notifications.listNotifications(...args)),
    count: (...args) => as('b', () => notifications.getUnreadCount(...args)),
    read: (...args) => as('b', () => notifications.markNotificationRead(...args)),
    readAll: (...args) => as('b', () => notifications.markAllNotificationsRead(...args)),
  } });
  store.start();
  await until(() => store.getState().unreadCount === 0);
  const conversation = (await as('a', () => openConversation(incoming.id, accounts.a.id))).data;
  const send = body => as('a', () => sendMessage(conversation.id, body, accounts.a.id));
  const body = { body: 'Hello \u{1f44b}\nThis is a multiline notification test.', clientMessageId: randomUUID() };
  const message = (await send(body)).data;
  await send(body);
  const began = Date.now();
  await until(() => store.getState().unreadCount === 1, 40000);
  assert.ok(Date.now() - began > 15000, 'Count should arrive through the regular 30-second poll, not an explicit refresh.');
  await store.setOpen(true);
  await until(() => store.getState().loaded);
  const group = store.getState().items.find(n => n.type === 'message');
  assert.equal(group.eventCount, 1);
  assert.equal(group.readAt, null);
  assert.equal(notificationPath(group), `/messages/${conversation.id}`);
  assert.equal((await as('b', () => listMessages(conversation.id))).data[0].body, body.body);
  assert.ok(!JSON.stringify(group).includes(body.body));
  console.log('PASS actual 30-second polling, message retry idempotency, panel opening without acknowledgement, emoji and multiline history');

  await send({ body: 'Newer activity', clientMessageId: randomUUID() });
  await assert.rejects(as('b', () => notifications.markNotificationRead(accounts.b.id, group)), e => e.status === 409 && e.code === 'NOTIFICATION_UPDATED');
  await store.refresh();
  const current = store.getState().items.find(n => n.type === 'message');
  assert.equal(current.eventCount, 2);
  await store.markRead(current);
  assert.equal(store.getState().unreadCount, 0);
  await send({ body: 'A new group after acknowledgement', clientMessageId: randomUUID() });
  await store.refresh();
  const next = store.getState().items.find(n => n.type === 'message' && !n.readAt);
  assert.notEqual(next.id, group.id);
  assert.equal(next.eventCount, 1);
  await store.markAllRead();
  assert.equal(store.getState().unreadCount, 0);
  assert.ok(store.getState().items.every(n => n.readAt));
  console.log('PASS aggregation, stale acknowledgement protection, new groups and synchronized individual/bulk reads');

  await assert.rejects(as('c', () => notifications.markNotificationRead(accounts.c.id, next)), e => e.status === 404);
  await assert.rejects(as('c', () => listMessages(conversation.id)), e => e.status === 404);
  assert.ok((await list('c')).data.every(n => n.type !== 'message'));
  store.stop();
  await as('b', () => logoutUser());
  notifications.resetNotificationsSession();
  await assert.rejects(list('b'), e => e.status === 401);
  await as('b', () => loginUser({ email: accounts.a.email, password }));
  await assert.rejects(list('b'), e => e.code === 'SESSION_CHANGED');
  notifications.resetNotificationsSession();
  const switched = await as('b', () => notifications.listNotifications(accounts.a.id));
  assert.ok(switched.data.every(n => n.type.startsWith('request_')));
  await as('b', () => logoutUser());
  await as('b', () => loginUser({ email: accounts.b.email, password }));
  notifications.resetNotificationsSession();
  assert.equal((await list('b')).data.filter(n => n.type === 'message').length, 2);
  assert.equal((await as('b', () => listMessages(conversation.id))).data[0].id, message.id);
  console.log('PASS recipient privacy, logout, same-session account switching and persisted notification/message history');
  console.log('Notification integration passed. Only synthetic local records were created.');
} finally {
  store?.stop();
  await Promise.allSettled(['a', 'b', 'c'].map(actor => as(actor, () => logoutUser())));
  notifications.resetNotificationsSession();
  globalThis.fetch = nativeFetch;
}
