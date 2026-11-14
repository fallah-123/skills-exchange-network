import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/api/notifications.api.js';
import { createNotificationStore } from '../src/utils/notificationStore.js';
import { notificationPath, notificationText, relativeNotificationTime } from '../src/utils/notifications.js';
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; api.resetNotificationsSession(); });
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
const item = { id: '9007199254740993', type: 'message', actor: { id: 2, displayName: 'Alex <script>' }, conversationId: 4, requestId: null, lastMessageId: '9007199254740995', eventCount: 2, readAt: null, lastEventAt: '2026-01-01T00:00:00Z' };
const page = (data = [item], count = 1, cursor = null) => ({ data, meta: { userId: 1, unreadCount: count, nextCursor: cursor } });
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function clock() {
  let now = 0, id = 0; const timers = new Map();
  return { now: () => now, setTimeout(fn, ms) { timers.set(++id, { at: now + ms, fn }); return id; }, clearTimeout(id) { timers.delete(id); },
    async advance(ms) { const end = now + ms; for (;;) { await flush(); const next = [...timers].filter(([, t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break; timers.delete(next[0]); now=next[1].at; next[1].fn(); } now=end; await flush(); } };
}
function setup(overrides = {}) {
  const environment = { document: Object.assign(new EventTarget(), { visibilityState: 'visible' }), window: new EventTarget(), navigator: { onLine: true } };
  const timer = clock(); const updates = []; let calls = 0;
  const adapters = { count: async () => { calls++; return { data: { unreadCount: 1 }, meta: { userId: 1 } }; }, list: async () => page(), read: async () => ({ meta: { unreadCount: 0 } }), readAll: async () => ({ meta: { unreadCount: 0 } }), ...overrides };
  const store = createNotificationStore({ userId: 1, api: adapters, environment, clock: timer, onChange: value => updates.push(value) });
  return { store, environment, timer, updates, calls: () => calls };
}

test('notification API uses session credentials, CSRF, exact IDs and no recipient fields', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => { calls.push({ url, options }); return response(url.endsWith('csrf-token') ? { data: { userId: 1, csrfToken: 'token' } } : { data: { read: true }, meta: { userId: 1, unreadCount: 0 } }); };
  await api.markNotificationRead(1, item);
  assert.equal(calls[1].url, `/api/notifications/${item.id}/read`);
  assert.equal(calls[1].options.credentials, 'include');
  assert.equal(calls[1].options.headers['X-CSRF-Token'], 'token');
  assert.deepEqual(JSON.parse(calls[1].options.body), { lastMessageId: item.lastMessageId });
});
test('CSRF refresh retries once; ordinary network errors never retry writes', async () => {
  let gets = 0, posts = 0;
  globalThis.fetch = async url => url.endsWith('csrf-token') ? (gets++, response({ data: { userId: 1, csrfToken: `token${gets}` } })) : (++posts === 1 ? response({ error: { code: 'CSRF_INVALID', message: 'Refresh' } }, 403) : response({ data: {}, meta: { userId: 1 } }));
  await api.markAllNotificationsRead(1); assert.equal(gets, 2); assert.equal(posts, 2);
  globalThis.fetch = async () => { posts++; throw new Error('offline'); };
  await assert.rejects(api.markAllNotificationsRead(1), e => e.code === 'NETWORK_ERROR'); assert.equal(posts, 3);
});
test('account mismatch blocks writes and discards notification reads from another session', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response({ data: { userId: 2, csrfToken: 'wrong' }, meta: { userId: 2 } }); };
  await assert.rejects(api.markAllNotificationsRead(1), e => e.code === 'SESSION_CHANGED'); assert.equal(calls, 1);
  await assert.rejects(api.listNotifications(1), e => e.code === 'SESSION_CHANGED');
});
test('logout invalidates late reads and token responses before any write', async () => {
  const wait = deferred(); globalThis.fetch = () => wait.promise;
  const reading = api.getUnreadCount(1); api.resetNotificationsSession();
  wait.resolve(response({ data: { unreadCount: 9 }, meta: { userId: 1 } }));
  await assert.rejects(reading, e => e.name === 'AbortError');
  const token = deferred(); let calls = 0; globalThis.fetch = () => { calls++; return token.promise; };
  const writing = api.markAllNotificationsRead(1); api.resetNotificationsSession();
  token.resolve(response({ data: { userId: 1, csrfToken: 'late' } }));
  await assert.rejects(writing, e => e.name === 'AbortError'); assert.equal(calls, 1);
});
test('polls every 30 seconds, pauses hidden/offline, resumes, and stops on unmount', async () => {
  const { store, environment, timer, calls } = setup(); store.start(); await flush(); assert.equal(calls(), 1);
  await timer.advance(30000); assert.equal(calls(), 2);
  environment.document.visibilityState = 'hidden'; environment.document.dispatchEvent(new Event('visibilitychange'));
  await timer.advance(60000); assert.equal(calls(), 2);
  environment.document.visibilityState = 'visible'; environment.document.dispatchEvent(new Event('visibilitychange')); await flush(); assert.equal(calls(), 3);
  environment.navigator.onLine = false; environment.window.dispatchEvent(new Event('offline')); await timer.advance(60000); assert.equal(calls(), 3);
  environment.navigator.onLine = true; environment.window.dispatchEvent(new Event('online')); await flush(); assert.equal(calls(), 4);
  store.stop(); await timer.advance(60000); assert.equal(calls(), 4);
});
test('opening loads the panel without marking read, including during an in-flight count', async () => {
  const wait = deferred(); let reads = 0;
  const { store } = setup({ count: () => wait.promise, list: async () => { reads++; return page(); }, read: () => { throw new Error('Must not acknowledge on open'); } });
  store.start(); await flush(); const opening = store.setOpen(true); wait.resolve({ data: { unreadCount: 99 } }); await opening; await flush();
  assert.equal(reads, 1); assert.equal(store.getState().items[0].readAt, null); assert.equal(store.getState().unreadCount, 1); store.stop();
});
test('read mutations refresh authoritative counts and state; pagination deduplicates IDs', async () => {
  let marked = false;
  const { store } = setup({ list: async (_, cursor) => cursor ? page([item, { ...item, id: '10' }]) : page([{ ...item, readAt: marked ? '2026-01-01' : null }], marked ? 0 : 1, 'older'),
    read: async () => { marked = true; return { meta: { unreadCount: 0 } }; } });
  store.start(); await flush(); await store.setOpen(true); await store.loadMore(); assert.equal(store.getState().items.length, 2);
  await store.markRead(item); assert.equal(store.getState().unreadCount, 0); assert.ok(store.getState().items[0].readAt); store.stop();
});
test('new-message conflict remains unread and displays a recoverable error', async () => {
  const { store } = setup({ read: async () => { throw Object.assign(new Error('New messages arrived'), { code: 'NOTIFICATION_UPDATED', status: 409 }); } });
  store.start(); await flush(); await store.setOpen(true); await store.markRead(item);
  assert.equal(store.getState().unreadCount, 1); assert.equal(store.getState().items[0].readAt, null); assert.equal(store.getState().actionError.code, 'NOTIFICATION_UPDATED'); store.stop();
});
test('stopped account discards late responses and a different store begins empty', async () => {
  const wait = deferred(); const first = setup({ list: () => wait.promise }); first.store.start(); await flush(); const opening = first.store.setOpen(true); await flush(); first.store.stop();
  const length = first.updates.length; wait.resolve(page()); await opening; assert.equal(first.updates.length, length);
  const second = setup(); assert.deepEqual(second.store.getState().items, []); assert.equal(second.store.getState().unreadCount, null); second.store.stop();
});
test('account mismatch clears private state and stops polling; transient errors back off', async () => {
  let failed = false; const first = setup({ list: async () => { if (failed) throw Object.assign(new Error('Account changed'), { code: 'SESSION_CHANGED' }); return page(); } });
  first.store.start(); await flush(); await first.store.setOpen(true); failed = true; await first.store.refresh();
  assert.deepEqual(first.store.getState().items, []); assert.equal(first.store.getState().unreadCount, null); first.store.stop();
  let calls = 0; const second = setup({ count: async () => { calls++; throw Object.assign(new Error('offline'), { code: 'NETWORK_ERROR' }); } });
  second.store.start(); await flush(); assert.equal(second.store.getState().status.phase, 'retrying'); await second.timer.advance(30000); assert.equal(calls, 1); await second.timer.advance(30000); assert.equal(calls, 2); second.store.stop();
});
test('notification descriptions and destinations cover all event types without message previews', () => {
  assert.equal(notificationText(item), 'Alex <script> sent you 2 new messages.'); assert.equal(notificationPath(item), '/messages/4');
  assert.match(notificationText({ ...item, eventCount: 1 }), /sent you a message/);
  for (const [type, word, tab] of [['request_received','sent','incoming'],['request_accepted','accepted','outgoing'],['request_rejected','declined','outgoing']]) {
    const value = { ...item, type, requestId: 8 }; assert.ok(notificationText(value).includes(word)); assert.equal(notificationPath(value), `/requests?tab=${tab}&requestId=8`);
  }
  assert.equal(relativeNotificationTime('2026-01-01T00:00:00Z', Date.parse('2026-01-01T00:00:10Z')), 'Just now');
});

test('clearing APIs send DELETE with CSRF and displayed version; bulk operations send no recipient', async () => {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return response(url.endsWith('csrf-token') ? { data: { userId: 1, csrfToken: 'token' } } : { data: { clearedIds: [item.id], clearedCount: 1 }, meta: { userId: 1, unreadCount: 0 } });
  };
  await api.clearNotification(1, item); await api.clearReadNotifications(1); await api.clearAllNotifications(1);
  assert.deepEqual(calls.slice(1).map(c => c.url), [`/api/notifications/${item.id}`, '/api/notifications/read', '/api/notifications']);
  for (const { options } of calls.slice(1)) { assert.equal(options.method, 'DELETE'); assert.equal(options.headers['X-CSRF-Token'], 'token'); assert.equal(options.credentials, 'include'); }
  assert.deepEqual(JSON.parse(calls[1].options.body), { lastMessageId: item.lastMessageId });
  assert.deepEqual(JSON.parse(calls[2].options.body), {}); assert.deepEqual(JSON.parse(calls[3].options.body), {});
});

test('individual clear removes only confirmed IDs and immediately updates the count', async () => {
  let removed = false;
  const { store } = setup({ list: async () => page(removed ? [] : [item], removed ? 0 : 1),
    clear: async (_, value) => { assert.equal(value.id, item.id); removed = true; return { data: { clearedIds: [item.id] }, meta: { unreadCount: 0 } }; } });
  store.start(); await flush(); await store.setOpen(true); await store.clearOne(item);
  assert.deepEqual(store.getState().items, []); assert.equal(store.getState().unreadCount, 0); assert.equal(store.getState().loaded, true); store.stop();
});

test('clear read retains unread items and does not optimistically erase concurrent activity', async () => {
  const readItem = { ...item, id: '7', readAt: '2026-01-01' }; let removed = false;
  const { store } = setup({ list: async () => page(removed ? [item] : [item, readItem]),
    clearRead: async () => { removed = true; return { data: { clearedIds: ['7'] }, meta: { unreadCount: 1 } }; } });
  store.start(); await flush(); await store.setOpen(true); await store.clearRead();
  assert.deepEqual(store.getState().items, [item]); assert.equal(store.getState().unreadCount, 1); store.stop();
});

test('clear all requires confirmation; cancellation and repeated pending actions do not delete', async () => {
  const pending = deferred(); let calls = 0, removed = false;
  const { store } = setup({ list: async () => page(removed ? [] : [item], removed ? 0 : 1),
    clearAll: async () => { calls++; await pending.promise; removed = true; return { data: { clearedIds: [item.id] }, meta: { unreadCount: 0 } }; } });
  store.start(); await flush(); await store.setOpen(true);
  await store.confirmClearAll(); assert.equal(calls, 0);
  store.requestClearAll(); assert.equal(store.getState().confirmClearAll, true); store.cancelClearAll();
  await store.confirmClearAll(); assert.equal(calls, 0);
  store.requestClearAll(); const clearing = store.confirmClearAll(); await flush();
  assert.equal(store.getState().busy, true); assert.equal(store.getState().confirmClearAll, false);
  store.requestClearAll(); await store.confirmClearAll(); assert.equal(calls, 1);
  pending.resolve(); await clearing; assert.equal(store.getState().busy, false); assert.deepEqual(store.getState().items, []); store.stop();
});

test('a stale polling response cannot restore a cleared notification', async () => {
  const lateRead = deferred(); let reads = 0, removed = false;
  const { store } = setup({ list: async () => ++reads === 2 ? lateRead.promise : page(removed ? [] : [item], removed ? 0 : 1),
    clear: async () => { removed = true; return { data: { clearedIds: [item.id] }, meta: { unreadCount: 0 } }; } });
  store.start(); await flush(); await store.setOpen(true);
  const polling = store.refresh(); await flush(); const clearing = store.clearOne(item); await flush();
  lateRead.resolve(page()); await polling; await clearing;
  assert.deepEqual(store.getState().items, []); assert.equal(store.getState().unreadCount, 0); store.stop();
});

test('clearing errors preserve items and stale-version conflicts refresh newer activity', async () => {
  const newest = { ...item, eventCount: 3, lastMessageId: '9007199254740996' }; let failed = false;
  const { store } = setup({ list: async () => page([failed ? newest : item]), clear: async () => {
    failed = true; throw Object.assign(new Error('Review new messages'), { status: 409, code: 'NOTIFICATION_UPDATED' });
  } });
  store.start(); await flush(); await store.setOpen(true); await store.clearOne(item);
  assert.equal(store.getState().actionError.code, 'NOTIFICATION_UPDATED'); assert.deepEqual(store.getState().items, [newest]); assert.equal(store.getState().unreadCount, 1);
  await store.refresh(); assert.equal(store.getState().actionError, null); store.stop();
});

test('switching accounts cancels pending clearing and discards its late result and confirmation state', async () => {
  const pending = deferred(); let signal;
  const first = setup({ clearAll: async (_, value) => { signal = value; return pending.promise; } });
  first.store.start(); await flush(); await first.store.setOpen(true); first.store.requestClearAll();
  const clearing = first.store.confirmClearAll(); await flush(); first.store.stop();
  assert.equal(signal.aborted, true); const count = first.updates.length;
  const second = setup(); assert.equal(second.store.getState().confirmClearAll, false); assert.equal(second.store.getState().busy, false);
  pending.resolve({ data: { clearedIds: [item.id] }, meta: { unreadCount: 0 } }); await clearing;
  assert.equal(first.updates.length, count); assert.deepEqual(second.store.getState().items, []); second.store.stop();
});
