// Non-destructive integration check: creates two synthetic accounts, never resets
// the database, and uses the real frontend API modules and polling implementation.
import assert from 'node:assert/strict';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { registerUser, loginUser, logoutUser } from '../src/api/auth.api.js';
import { createRequest, respondToRequest } from '../src/api/requests.api.js';
import { listConversations, listMessages, openConversation, sendMessage } from '../src/api/messaging.api.js';
import { createHistoryReader, createPollingTask } from '../src/utils/polling.js';
import { mergeMessages } from '../src/utils/messaging.js';

if (process.env.INTEGRATION_TARGET_IS_TEST_DB !== 'yes') {
  throw new Error('Set INTEGRATION_TARGET_IS_TEST_DB=yes only for a frontend proxy connected to the isolated test backend.');
}
const origin = new URL(process.env.INTEGRATION_ORIGIN || 'http://127.0.0.1:5175');
if (origin.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.username || origin.password) {
  throw new Error('This check only accepts a local HTTP test origin.');
}
const nativeFetch = globalThis.fetch;
const session = new AsyncLocalStorage();
const cookies = new Map();
globalThis.fetch = async (path, options = {}) => {
  assert.ok(typeof path === 'string' && path.startsWith('/api/'));
  const actor = session.getStore();
  assert.ok(actor, 'Every request must use a distinct test session.');
  const headers = new Headers(options.headers);
  if (cookies.has(actor)) headers.set('Cookie', cookies.get(actor));
  const result = await nativeFetch(new URL(path, origin), { ...options, headers, signal: options.signal || AbortSignal.timeout(15000) });
  for (const cookie of result.headers.getSetCookie()) cookies.set(actor, cookie.split(';')[0]);
  return result;
};
const as = (actor, action) => session.run(actor, action);
async function until(predicate) {
  const deadline = Date.now() + 12000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Automatic update did not arrive within 12 seconds.');
    await delay(25);
  }
}

const stamp = randomUUID();
const password = `Test-${randomUUID()}!`;
let task;
try {
  const users = {};
  for (const actor of ['a', 'b']) {
    const account = { displayName: `Polling Test ${actor.toUpperCase()}`, email: `poll-${stamp}-${actor}@example.test`, password };
    users[actor] = (await as(actor, () => registerUser(account))).data;
    await as(actor, () => loginUser({ email: account.email, password }));
  }
  const request = (await as('a', () => createRequest(users.b.id, 'Synthetic automatic messaging check.'))).data;
  await as('b', () => respondToRequest(request.id, 'accept'));
  const conversation = (await as('a', () => openConversation(request.id, users.a.id))).data;
  const initial = await as('b', () => listMessages(conversation.id));
  let messages = initial.data;
  let reads = 0;
  let status;
  const reader = createHistoryReader({ after: initial.meta.nextAfter,
    fetchPage: (after, signal) => as('b', () => listMessages(conversation.id, { after }, signal)),
    onPage: (result) => { messages = mergeMessages(messages, result.data); },
  });
  task = createPollingTask({ intervalMs: 3000, run: async (signal) => { reads += 1; return reader(signal); }, onStatus: (value) => { status = value; } });
  task.resume();
  await until(() => status?.phase === 'live');
  const first = (await as('a', () => sendMessage(conversation.id, { body: 'Automatic reply test 👋\nSecond line', clientMessageId: randomUUID() }, users.a.id))).data;
  const own = (await as('b', () => sendMessage(conversation.id, { body: 'Own send while an incoming reply awaits polling', clientMessageId: randomUUID() }, users.b.id))).data;
  messages = mergeMessages(messages, [own]);
  await until(() => messages.some((message) => message.id === first.id));
  assert.deepEqual(messages.map((message) => message.id), [first.id, own.id]);
  assert.equal(messages[0].body, first.body);
  console.log('PASS automatic receipt, Unicode persistence, and concurrent send deduplication');

  task.pause('offline');
  const pausedReads = reads;
  const missed = (await as('a', () => sendMessage(conversation.id, { body: 'Catch up after returning to the conversation', clientMessageId: randomUUID() }, users.a.id))).data;
  await delay(250);
  assert.equal(reads, pausedReads);
  assert.ok(!messages.some((message) => message.id === missed.id));
  task.resume();
  await until(() => messages.some((message) => message.id === missed.id));
  console.log('PASS pause and immediate catch-up on resume');

  const inbox = await as('b', () => listConversations(1));
  assert.equal(inbox.data.find((item) => item.id === conversation.id).lastMessage.id, missed.id);
  console.log('PASS persisted inbox preview');

  await as('b', () => logoutUser());
  await until(() => status?.phase === 'error');
  assert.equal(status.error.status, 401);
  console.log('PASS expired session stops automatic reads');
  task.stop();

  // Reproduce logout/login in the SAME browser session, rather than only testing
  // two independent cookie jars. Verify both short and paginated conversations.
  await as('a', () => logoutUser());
  await as('a', () => loginUser({ email: `poll-${stamp}-b@example.test`, password }));
  const shortHistory = await as('a', () => listMessages(conversation.id));
  assert.deepEqual(shortHistory.data.map((message) => message.id), [first.id, own.id, missed.id]);
  console.log('PASS short conversation history after switching accounts in the same session');

  await as('b', () => loginUser({ email: `poll-${stamp}-a@example.test`, password }));
  const expectedIds = [first.id, own.id, missed.id];
  for (let index = 0; index < 32; index += 1) {
    const actor = index % 2 ? 'a' : 'b';
    const userId = actor === 'a' ? users.b.id : users.a.id;
    const saved = await as(actor, () => sendMessage(conversation.id, {
      body: `History check ${index + 1}`, clientMessageId: randomUUID(),
    }, userId));
    expectedIds.push(saved.data.id);
  }
  await as('a', () => logoutUser());
  await as('a', () => loginUser({ email: `poll-${stamp}-a@example.test`, password }));
  const recentHistory = await as('a', () => listMessages(conversation.id));
  assert.equal(recentHistory.data.length, 30);
  assert.ok(recentHistory.meta.nextBefore);
  let allHistory = recentHistory.data;
  let before = recentHistory.meta.nextBefore;
  while (before) {
    const earlier = await as('a', () => listMessages(conversation.id, { before }));
    allHistory = mergeMessages(allHistory, earlier.data);
    before = earlier.meta.nextBefore;
  }
  assert.deepEqual(allHistory.map((message) => message.id), expectedIds);
  console.log('PASS all 35 messages remain available after account switching, including older history');
  console.log('Messaging polling integration passed. Existing test accounts and messages were preserved.');
} finally {
  task?.stop();
  await Promise.allSettled(['a', 'b'].map((actor) => as(actor, () => logoutUser())));
  globalThis.fetch = nativeFetch;
}
