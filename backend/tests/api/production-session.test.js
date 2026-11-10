import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

const fields = { displayName: 'Production User', email: 'production@example.test', password: 'production-session-test-password' };
const cookiePair = response => response.headers['set-cookie'][0].split(';')[0];
function secureCookie(response, clearing = false) {
  const cookie = response.headers['set-cookie'][0];
  assert.match(cookie, /^sdn\.sid=/);
  for (const attribute of [/; Path=\//, /; HttpOnly/, /; Secure/, /; SameSite=Lax/]) assert.match(cookie, attribute);
  assert.doesNotMatch(cookie, /; Domain=/);
  if (clearing) assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
}
function app(mode = 'production') { return createApp(testPool, { nodeEnv: mode }); }
function https(application, method, path, cookie) {
  const operation = request(application)[method](path).set('X-Forwarded-Proto', 'https');
  if (cookie) operation.set('Cookie', cookie);
  return operation;
}
async function registerAndLogin(application) {
  await https(application, 'post', '/api/auth/register').send(fields).expect(201);
  return https(application, 'post', '/api/auth/login').send(fields).expect(200);
}

test('production registration, HTTPS login, persisted session and logout use consistent secure Lax cookies', async () => {
  const production = app();
  const login = await registerAndLogin(production);
  secureCookie(login);
  const cookie = cookiePair(login);
  await https(app(), 'get', '/api/auth/me', cookie).expect(200);
  const csrf = await https(production, 'get', '/api/conversations/csrf-token', cookie).expect(200);
  assert.ok(csrf.body.data.csrfToken);
  assert.equal(csrf.headers['cache-control'], 'no-store');
  const logout = await https(production, 'post', '/api/auth/logout', cookie).expect(200);
  secureCookie(logout, true);
  await https(production, 'get', '/api/auth/me', cookie).expect(401);
  await https(production, 'get', '/api/conversations', cookie).expect(401);
  assert.equal((await testPool.query('SELECT * FROM user_sessions')).rowCount, 0);
});

test('production refuses untrusted plain HTTP before authentication writes; health probes remain usable', async () => {
  const production = app();
  for (const path of ['/api/auth/register', '/api/auth/login']) {
    const response = await request(production).post(path).send(fields).expect(400);
    assert.equal(response.body.error.code, 'HTTPS_REQUIRED');
    assert.equal(response.headers['set-cookie'], undefined);
  }
  await request(production).get('/api/auth/me').set('X-Forwarded-Proto', 'http').expect(400);
  await request(production).get('/api/health').expect(200);
  assert.equal((await testPool.query('SELECT * FROM users')).rowCount, 0);
  assert.equal((await testPool.query('SELECT * FROM user_sessions')).rowCount, 0);
});

test('development sessions upgrade on HTTPS without logout, changed session IDs, or invalidated messaging tokens', async () => {
  const development = app('development');
  const login = await registerAndLogin(development);
  const cookie = cookiePair(login);
  assert.doesNotMatch(login.headers['set-cookie'][0], /; Secure/);
  const oldToken = (await https(development, 'get', '/api/conversations/csrf-token', cookie)).body.data.csrfToken;
  const before = (await testPool.query('SELECT sid, sess FROM user_sessions')).rows[0];
  const production = app();
  // An HTTP request cannot consume the one-time upgrade without delivering it.
  const probe = await request(production).get('/api/health').set('Cookie', cookie).expect(200);
  assert.equal(probe.headers['set-cookie'], undefined);
  await request(production).get('/api/auth/me').set('Cookie', cookie).expect(400);
  assert.equal((await testPool.query('SELECT sess FROM user_sessions')).rows[0].sess.cookie.secure, false);
  const upgraded = await https(production, 'get', '/api/auth/me', cookie).expect(200);
  secureCookie(upgraded);
  assert.equal(cookiePair(upgraded), cookie);
  const afterUpgrade = (await testPool.query('SELECT sid, sess FROM user_sessions')).rows[0];
  assert.equal(afterUpgrade.sid, before.sid);
  assert.equal(afterUpgrade.sess.userId, before.sess.userId);
  assert.equal(afterUpgrade.sess.cookie.secure, true);
  assert.equal(afterUpgrade.sess.cookie.sameSite, 'lax');
  assert.equal(afterUpgrade.sess.cookie.originalMaxAge, before.sess.cookie.originalMaxAge);
  const token = await https(production, 'get', '/api/conversations/csrf-token', cookie).expect(200);
  assert.equal(token.body.data.csrfToken, oldToken);
  assert.equal(token.headers['set-cookie'], undefined, 'upgraded reads should not reissue cookies repeatedly');
  const nextLogin = await https(production, 'post', '/api/auth/login').send(fields).expect(200);
  assert.notEqual(cookiePair(nextLogin), cookie, 'a fresh login still creates a fresh session');
});

test('older SameSite=None sessions upgrade consistently during concurrent requests', async () => {
  const production = app();
  const cookie = cookiePair(await registerAndLogin(production));
  await testPool.query(`UPDATE user_sessions SET sess = jsonb_set(sess::jsonb, '{cookie,sameSite}', '"none"')::json`);
  const responses = await Promise.all([
    https(production, 'get', '/api/auth/me', cookie).expect(200),
    https(production, 'get', '/api/conversations/csrf-token', cookie).expect(200)
  ]);
  for (const response of responses) {
    if (response.headers['set-cookie']) { secureCookie(response); assert.equal(cookiePair(response), cookie); }
  }
  const stored = (await testPool.query('SELECT sess FROM user_sessions')).rows[0].sess;
  assert.equal(stored.cookie.sameSite, 'lax');
  assert.equal(stored.cookie.secure, true);
  assert.equal((await testPool.query('SELECT * FROM user_sessions')).rowCount, 1);
});

test('a delayed cookie upgrade cannot resurrect a session after concurrent logout', { timeout: 10000 }, async () => {
  const cookie = cookiePair(await registerAndLogin(app('development')));
  let releaseSave;
  let notifySave;
  const saveBlocked = new Promise(resolve => { notifySave = resolve; });
  const gate = new Promise(resolve => { releaseSave = resolve; });
  const delayedPool = {
    connect: (...args) => testPool.connect(...args),
    async query(sql, ...args) {
      if (typeof sql === 'string' && sql.startsWith('UPDATE public.user_sessions SET sess')) {
        notifySave();
        await gate;
      }
      return testPool.query(sql, ...args);
    }
  };
  const delayedApp = createApp(delayedPool, { nodeEnv: 'production' });
  const pending = https(delayedApp, 'get', '/api/auth/me', cookie).then(response => response);
  try {
    await saveBlocked;
    await https(app(), 'post', '/api/auth/logout', cookie).expect(200);
    assert.equal((await testPool.query('SELECT * FROM user_sessions')).rowCount, 0);
  } finally { releaseSave(); }
  await pending;
  assert.equal((await testPool.query('SELECT * FROM user_sessions')).rowCount, 0);
  await https(app(), 'get', '/api/auth/me', cookie).expect(401);
});

test('production cookies preserve accepted-connection messaging, Unicode history, and access checks', async () => {
  const production = app();
  const first = cookiePair(await registerAndLogin(production));
  const secondFields = { ...fields, email: 'second@example.test', displayName: 'Second User' };
  await https(production, 'post', '/api/auth/register').send(secondFields).expect(201);
  const second = cookiePair(await https(production, 'post', '/api/auth/login').send(secondFields).expect(200));
  const connection = (await https(production, 'post', '/api/requests', first).send({ recipientId: 2, message: 'Let us connect.' }).expect(201)).body.data;
  await https(production, 'post', `/api/requests/${connection.id}/accept`, second).expect(200);
  const token = (await https(production, 'get', '/api/conversations/csrf-token', first).expect(200)).body.data.csrfToken;
  const conversation = (await https(production, 'post', '/api/conversations', first).set('X-CSRF-Token', token).send({ requestId: connection.id }).expect(201)).body.data;
  const message = { body: 'Hello 🙂\nProduction session', clientMessageId: '4d105906-f80f-4db9-9046-740006a3ef13' };
  await https(production, 'post', `/api/conversations/${conversation.id}/messages`, first).set('X-CSRF-Token', token).send(message).expect(201);
  const history = await https(production, 'get', `/api/conversations/${conversation.id}/messages`, second).expect(200);
  assert.equal(history.body.data[0].body, message.body);
  await https(production, 'get', `/api/conversations/${conversation.id}/messages`).expect(401);
  await https(production, 'post', `/api/conversations/${conversation.id}/messages`, first).send(message).expect(403);
});
