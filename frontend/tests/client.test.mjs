import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { request, setUnauthenticatedHandler } from '../src/api/client.js';

const originalFetch = globalThis.fetch;
const originalNow = Date.now;
afterEach(() => {
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
  setUnauthenticatedHandler(null);
});

test('plain-text proxy 429 gives retry guidance without retrying login or expiring the session', async () => {
  let calls = 0;
  let expired = false;
  setUnauthenticatedHandler(() => { expired = true; });
  globalThis.fetch = async () => {
    calls++;
    return new Response('Too Many Requests', { status: 429, headers: { 'Retry-After': '60' } });
  };
  await assert.rejects(request('POST', '/api/auth/login', { body: { email: 'demo@example.test', password: 'test-only' } }), {
    status: 429, code: 'RATE_LIMITED', retryAfter: 60,
    message: 'Too many requests. Please wait 60 seconds before trying again.',
  });
  assert.equal(calls, 1);
  assert.equal(expired, false);
});

test('HTTP-date Retry-After is respected by callers, including polling', async () => {
  Date.now = () => Date.UTC(2026, 10, 16, 10, 0, 0);
  globalThis.fetch = async () => new Response('<html>Rate limited</html>', {
    status: 429, headers: { 'Retry-After': 'Mon, 16 Nov 2026 10:02:00 GMT' },
  });
  await assert.rejects(request('GET', '/api/auth/me'), { status: 429, retryAfter: 120, code: 'RATE_LIMITED' });
});

test('missing, malformed and expired retry headers do not produce invalid wait durations', async () => {
  for (const value of ['', 'invalid', '-10', '1.5', '0x10', 'Infinity', '9999999999999999999999999', 'Mon, 01 Jan 2024 00:00:00 GMT']) {
    globalThis.fetch = async () => new Response('', { status: 429, headers: { 'Retry-After': value } });
    await assert.rejects(request('GET', '/api/auth/me'), {
      retryAfter: 0, message: 'Too many requests. Please wait a little before trying again.',
    });
  }
});

test('application-specific errors retain their code, message and details', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: {
    code: 'MESSAGE_RATE_LIMITED', message: 'Wait before sending.', details: { limit: 30 },
  } }), { status: 429, headers: { 'Retry-After': '12' } });
  await assert.rejects(request('POST', '/api/conversations/1/messages'), {
    status: 429, code: 'MESSAGE_RATE_LIMITED', message: 'Wait before sending.', details: { limit: 30 }, retryAfter: 12,
  });
});

test('unrelated malformed responses retain the existing fallback', async () => {
  globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 502 });
  await assert.rejects(request('GET', '/api/auth/me'), {
    status: 502, code: 'INVALID_RESPONSE', message: 'The server returned an unexpected response.',
  });
});
