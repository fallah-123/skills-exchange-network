import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';

const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/login' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const { MemoryRouter } = await import('react-router-dom');

register('./support/jsx-loader.mjs', import.meta.url);
const { AuthProvider, useAuth } = await import('../src/context/AuthContext.jsx');
const { ToastProvider, useToast } = await import('../src/context/ToastContext.jsx');
const { default: ProtectedRoute } = await import('../src/components/layout/ProtectedRoute.jsx');
const { default: PublicOnlyRoute } = await import('../src/components/layout/PublicOnlyRoute.jsx');
const { default: LoginPage } = await import('../src/pages/LoginPage.jsx');
const originalFetch = globalThis.fetch;
const originalNow = Date.now;
let root;
const container = document.getElementById('root');
const response = (status, data, retry) => new Response(JSON.stringify({ data }), {
  status, headers: retry === undefined ? {} : { 'Retry-After': retry },
});
function Probe() {
  const { user } = useAuth();
  const { toasts } = useToast();
  return React.createElement('div', null, user ? `Authenticated ${user.id}` : 'Signed out', ` Toasts: ${toasts.length}`);
}
function tree(child = React.createElement(Probe)) {
  return React.createElement(MemoryRouter, { initialEntries: ['/login'] },
    React.createElement(ToastProvider, null, React.createElement(AuthProvider, null, child)));
}
async function mount(child) {
  root = createRoot(container);
  await act(async () => root.render(tree(child)));
}
afterEach(async () => {
  if (root) await act(async () => root.unmount());
  root = null;
  globalThis.fetch = originalFetch;
  Date.now = originalNow;
});

test('successful session check preserves user; rerenders do not repeat it', async () => {
  let calls = 0;
  globalThis.fetch = async () => { calls++; return response(200, { id: 7 }); };
  await mount();
  assert.match(container.textContent, /Authenticated 7 Toasts: 0/);
  await act(async () => root.render(tree()));
  assert.equal(calls, 1);
});

test('401 confirms signed-out state without a warning', async () => {
  globalThis.fetch = async () => response(401);
  await mount();
  assert.match(container.textContent, /Signed out Toasts: 0/);
});

for (const status of [429, 500, 0]) {
  test(`${status || 'network'} failure stays unconfirmed, hides protected content and recovers only on Retry`, async () => {
    const calls = [];
    globalThis.fetch = async (url) => {
      calls.push(url);
      if (calls.length > 1) return response(200, { id: 7 });
      if (!status) throw new TypeError('offline');
      return response(status);
    };
    await mount(React.createElement(ProtectedRoute, null, React.createElement(Probe)));
    assert.match(container.textContent, /couldn't check your session/);
    assert.doesNotMatch(container.textContent, /Signed out|Authenticated|logged out/);
    assert.equal(document.activeElement.id, 'session-recovery-title');
    assert.equal(container.querySelectorAll('[role="status"]').length, 1);
    await act(async () => root.render(tree(React.createElement(ProtectedRoute, null, React.createElement(Probe)))));
    assert.equal(calls.length, 1);
    await act(async () => container.querySelector('button').click());
    assert.match(container.textContent, /Authenticated 7 Toasts: 0/);
    assert.deepEqual(calls, ['/api/auth/me', '/api/auth/me']);
  });
}

test('no protected children mount before a pending session check completes', async () => {
  let resolve;
  globalThis.fetch = () => new Promise(r => { resolve = r; });
  await mount(React.createElement(ProtectedRoute, null, 'PRIVATE CONTENT'));
  assert.doesNotMatch(container.textContent, /PRIVATE CONTENT/);
  await act(async () => resolve(response(200, { id: 1 })));
  assert.match(container.textContent, /PRIVATE CONTENT/);
});

for (const header of ['2', 'Thu, 19 Nov 2026 10:40:02 GMT', undefined, 'invalid']) {
  test(`session retry handles header ${header} and overlapping clicks`, async () => {
    let now = Date.UTC(2026, 10, 19, 10, 40);
    Date.now = () => now;
    let calls = 0, resolve;
    globalThis.fetch = async () => {
      calls++;
      if (calls === 1) return response(429, null, header);
      return new Promise(r => { resolve = r; });
    };
    await mount();
    const button = container.querySelector('button');
    const delayed = header && header !== 'invalid';
    assert.equal(button.disabled, Boolean(delayed));
    if (delayed) {
      await act(async () => { button.click(); button.click(); });
      assert.equal(calls, 1);
      now += 2001;
      await act(async () => new Promise(r => setTimeout(r, 280)));
      assert.equal(calls, 1, 'cooldown expiry must not send a request');
    }
    await act(async () => { button.click(); button.click(); });
    assert.equal(calls, 2);
    await act(async () => resolve(response(401)));
    assert.match(container.textContent, /Signed out Toasts: 0/);
  });
}

test('unmount aborts an outstanding session request', async () => {
  let signal;
  globalThis.fetch = (_, options) => {
    signal = options.signal;
    return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
  };
  await mount();
  await act(async () => root.unmount()); root = null;
  assert.equal(signal.aborted, true);
});

for (const header of ['2', 'Thu, 19 Nov 2026 10:40:02 GMT', undefined, 'invalid']) {
test(`manual login preserves duplicate guard and respects Retry-After ${header}`, async () => {
  let now = Date.UTC(2026, 10, 19, 10, 40); Date.now = () => now;
  let posts = 0, resolve;
  globalThis.fetch = async (_, options) => {
    if (options.method === 'GET') return response(401);
    posts++;
    return new Promise(r => { resolve = r; });
  };
  await mount(React.createElement(PublicOnlyRoute, null, React.createElement(LoginPage)));
  // React's onChange tracks native value changes through keyboard/input events.
  for (const [name, value] of [['email', 'demo@example.test'], ['password', 'test-password-123']]) {
    const input = container.querySelector(`[name="${name}"]`);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  }
  const submit = () => container.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await act(async () => { submit(); submit(); });
  assert.equal(posts, 1);
  await act(async () => resolve(response(429, null, header)));
  const delayed = Boolean(header && header !== 'invalid');
  assert.equal(container.querySelector('button[type="submit"]').disabled, delayed);
  if (delayed) {
    await act(async () => submit());
    assert.equal(posts, 1);
    now += 2001;
    await act(async () => new Promise(r => setTimeout(r, 280)));
  }
  assert.equal(posts, 1);
  assert.equal(container.querySelector('button[type="submit"]').disabled, false);
  await act(async () => submit());
  assert.equal(posts, 2);
  await act(async () => resolve(response(401)));
});
}

test('a stalled initial check times out into recovery instead of loading forever', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  globalThis.fetch = (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  await mount();
  await act(async () => t.mock.timers.tick(30000));
  assert.match(container.textContent, /couldn't check your session/);
  assert.equal(container.querySelector('button').disabled, false);
  t.mock.timers.reset();
});

test('unmount clears a cooldown and the next auth instance can check a different account', async () => {
  globalThis.fetch = async () => response(429, null, '600');
  await mount();
  assert.equal(container.querySelector('button').disabled, true);
  await act(async () => root.unmount()); root = null;
  globalThis.fetch = async () => response(200, { id: 22 });
  await mount();
  assert.match(container.textContent, /Authenticated 22 Toasts: 0/);
});
