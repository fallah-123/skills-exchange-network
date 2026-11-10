import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, request } from '../src/api/client.js';
import { listMessages, openConversation, resetMessagingSession, sendMessage } from '../src/api/messaging.api.js';
import { mergeMessages, messageLength, messageValidation } from '../src/utils/messaging.js';

const originalFetch = globalThis.fetch;
const fields = { body: 'Hello', clientMessageId: '4fb7e358-e995-429d-866e-f24e63ae4b19' };
const response = (payload, status = 200, headers = {}) => new Response(JSON.stringify(payload), { status, headers });
let calls;
function mock(...responses) {
  globalThis.fetch = async (url, options) => {
    calls.push({ url, ...options });
    const next = responses.shift();
    if (!next) throw new Error('Unexpected fetch');
    return typeof next === 'function' ? next() : next;
  };
}
beforeEach(() => { calls = []; resetMessagingSession(); });
afterEach(() => { globalThis.fetch = originalFetch; });

test('send uses credentials, CSRF header and server-authorized fields only', async () => {
  mock(response({ data: { csrfToken: 'token', userId: 1 } }), response({ data: { id: '9007199254740993', ...fields } }, 201));
  const result = await sendMessage(4, fields, 1);
  assert.equal(result.data.id, '9007199254740993');
  assert.equal(calls[1].credentials, 'include');
  assert.equal(calls[1].headers['X-CSRF-Token'], 'token');
  assert.deepEqual(JSON.parse(calls[1].body), fields);
});

test('CSRF refresh retries once with exactly the same message identifier and body', async () => {
  mock(response({ data: { csrfToken: 'old', userId: 1 } }), response({ error: { code: 'CSRF_INVALID' } }, 403),
    response({ data: { csrfToken: 'new', userId: 1 } }), response({ data: { id: '1' } }));
  await sendMessage(4, fields, 1);
  assert.equal(calls.length, 4);
  assert.equal(calls[1].body, calls[3].body);
  assert.equal(calls[3].headers['X-CSRF-Token'], 'new');
});

test('changed account in another tab stops the write before posting', async () => {
  mock(response({ data: { csrfToken: 'other', userId: 2 } }));
  await assert.rejects(openConversation(7, 1), { code: 'SESSION_CHANGED' });
  assert.equal(calls.length, 1);
});

test('changed account while refreshing CSRF never retries as the new user', async () => {
  mock(response({ data: { csrfToken: 'old', userId: 1 } }), response({ error: { code: 'CSRF_INVALID' } }, 403), response({ data: { csrfToken: 'other', userId: 2 } }));
  await assert.rejects(sendMessage(4, fields, 1), { code: 'SESSION_CHANGED' });
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
});

test('logout discards a late token response', async () => {
  let release;
  mock(() => new Promise((resolve) => { release = resolve; }));
  const pending = sendMessage(4, fields, 1);
  resetMessagingSession();
  release(response({ data: { csrfToken: 'old', userId: 1 } }));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls.length, 1);
});

test('aborted token request cannot start a send', async () => {
  const controller = new AbortController();
  mock(() => { controller.abort(); return response({ data: { csrfToken: 'old', userId: 1 } }); });
  await assert.rejects(sendMessage(4, fields, 1, controller.signal), { name: 'AbortError' });
  assert.equal(calls.length, 1);
});

test('network failure is exposed for manual retry without an automatic duplicate send', async () => {
  mock(response({ data: { csrfToken: 'token', userId: 1 } }), () => { throw new TypeError('offline'); });
  await assert.rejects(sendMessage(4, fields, 1), { code: 'NETWORK_ERROR' });
  assert.equal(calls.length, 2);
});

test('rate limit exposes Retry-After to the composer', async () => {
  mock(response({ error: { code: 'MESSAGE_RATE_LIMITED', message: 'Wait before sending.' } }, 429, { 'Retry-After': '12' }));
  await assert.rejects(request('POST', '/api/conversations/4/messages', { body: fields }), (error) => error instanceof ApiError && error.retryAfter === 12 && error.status === 429);
});

test('history cursors remain exact decimal strings', async () => {
  mock(response({ data: [], meta: { nextAfter: '9223372036854775806' } }));
  const result = await listMessages(4, { after: '9223372036854775806' });
  assert.match(calls[0].url, /after=9223372036854775806/);
  assert.equal(result.meta.nextAfter, '9223372036854775806');
});

test('merging overlapping history and send results deduplicates and orders bigint IDs', () => {
  const result = mergeMessages([{ id: '9007199254740994', body: 'later' }, { id: '2' }], [{ id: '9007199254740993' }, { id: '2', body: 'updated' }]);
  assert.deepEqual(result.map((message) => message.id), ['2', '9007199254740993', '9007199254740994']);
  assert.equal(result[0].body, 'updated');
});

test('message validation uses Unicode code points and rejects blank or invalid input', () => {
  assert.equal(messageLength('  😀  '), 1);
  assert.equal(messageValidation('😀'.repeat(2000)), '');
  assert.notEqual(messageValidation('😀'.repeat(2001)), '');
  assert.notEqual(messageValidation(' \n\t '), '');
  assert.notEqual(messageValidation('hello\0'), '');
  assert.notEqual(messageValidation('\uD800'), '');
  assert.equal(messageValidation('<script>literal text</script>'), '');
});

test('aborting while reading the JSON response preserves cancellation', async () => {
  globalThis.fetch = async () => ({ json: async () => { throw new DOMException('Cancelled', 'AbortError'); } });
  await assert.rejects(listMessages(1), { name: 'AbortError' });
});
