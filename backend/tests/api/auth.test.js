// API tests for account registration, session login, and logout behavior.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import argon2 from 'argon2';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

test('registers normalized account with empty profile and never returns password hash', async () => {
  const { agent } = createApi();
  const response = await agent.post('/api/auth/register').send({
    displayName: 'Example User', email: ' EXAMPLE@EXAMPLE.COM ', password: 'secure-password'
  });
  assert.equal(response.status, 201);
  assert.deepEqual(response.body.data, { id: 1, displayName: 'Example User', email: 'example@example.com' });
  assert.equal(JSON.stringify(response.body).includes('password_hash'), false);
  const profile = await agent.post('/api/auth/login').send({ email: 'example@example.com', password: 'secure-password' });
  assert.equal(profile.status, 200);
  assert.equal(JSON.stringify(profile.body).includes('password_hash'), false);
  assert.equal((await agent.get('/api/profile/me')).body.data.isComplete, false);
  const stored = await testPool.query('SELECT password_hash FROM users WHERE id = $1', [1]);
  assert.match(stored.rows[0].password_hash, /^\$argon2id\$/);
  assert.equal(await argon2.verify(stored.rows[0].password_hash, 'secure-password'), true);
});

test('rejects duplicate normalized emails and invalid registration fields', async () => {
  const { agent } = createApi();
  const valid = { displayName: 'Example User', email: 'example@example.com', password: 'secure-password' };
  assert.equal((await agent.post('/api/auth/register').send(valid)).status, 201);
  const duplicate = await agent.post('/api/auth/register').send({ ...valid, email: 'EXAMPLE@example.com' });
  assert.equal(duplicate.status, 409);
  const invalid = await agent.post('/api/auth/register').send({ displayName: 7, email: 'bad', password: 'short' });
  assert.equal(invalid.status, 400);
  assert.equal(Object.keys(invalid.body.error.details).length, 3);
  const missing = await agent.post('/api/auth/register').send({});
  assert.equal(missing.status, 400);
  assert.equal(Object.keys(missing.body.error.details).length, 3);
  const invalidEmail = await agent.post('/api/auth/register').send({
    displayName: 'Valid Name', email: 'bad-email', password: 'secure-password'
  });
  assert.equal(invalidEmail.body.error.details.email, 'Enter a valid email address.');
});

test('health endpoint is public and malformed JSON is a validation error', async () => {
  const { agent } = createApi();
  const health = await agent.get('/api/health');
  assert.deepEqual(health.body, { data: { status: 'ok', database: 'up' } });
  const malformed = await agent.post('/api/auth/register')
    .set('Content-Type', 'application/json')
    .send('{');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'VALIDATION_ERROR');
});

test('login sets a session, protects routes, and logout invalidates it', async () => {
  const { agent } = createApi();
  const fields = { displayName: 'Example User', email: 'example@example.com', password: 'secure-password' };
  await agent.post('/api/auth/register').send(fields);
  const unauthorized = await agent.get('/api/profile/me');
  assert.equal(unauthorized.status, 401);
  const loggedIn = await agent.post('/api/auth/login').send(fields);
  assert.equal(loggedIn.status, 200);
  assert.match(loggedIn.headers['set-cookie'][0], /sdn\.sid/);
  assert.equal((await agent.get('/api/auth/me')).status, 200);
  assert.equal((await agent.post('/api/auth/logout')).status, 200);
  assert.equal((await agent.get('/api/profile/me')).status, 401);
});

test('unknown email and wrong password return identical credentials errors', async () => {
  const { agent } = createApi();
  const wrong = await agent.post('/api/auth/login').send({ email: 'nobody@example.com', password: 'secure-password' });
  const { agent: secondAgent } = createApi();
  await secondAgent.post('/api/auth/register').send({
    displayName: 'Example User', email: 'example@example.com', password: 'secure-password'
  });
  const invalid = await secondAgent.post('/api/auth/login').send({
    email: 'example@example.com', password: 'incorrect-password'
  });
  assert.equal(wrong.status, 401);
  assert.deepEqual(wrong.body, invalid.body);
});
