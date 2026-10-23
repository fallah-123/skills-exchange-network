// API tests for public developer discovery, pagination, and private-field exclusion.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

test('lists and details public developers without exposing email and excludes self', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'Current User', email: 'current@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'current@example.com', password: 'password-123' });
  const { agent: second } = createApi();
  await second.post('/api/auth/register').send({ displayName: 'Other Developer', email: 'other@example.com', password: 'password-123' });
  const list = await agent.get('/api/developers?search=OTHER&page=1&limit=1');
  assert.equal(list.status, 200);
  assert.equal(list.body.meta.total, 1);
  assert.equal(list.body.data.length, 1);
  assert.equal(JSON.stringify(list.body).includes('other@example.com'), false);
  assert.equal((await agent.get('/api/developers/2')).body.data.displayName, 'Other Developer');
  assert.equal((await agent.get('/api/developers/999')).status, 404);
  assert.equal((await agent.get('/api/developers?search=%25')).body.meta.total, 0);
});

test('connection shows live requests and becomes null after rejection', async () => {
  const first = createApi().agent;
  const second = createApi().agent;
  await first.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await first.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  await second.post('/api/auth/register').send({ displayName: 'Second User', email: 'second@example.com', password: 'password-123' });
  await second.post('/api/auth/login').send({ email: 'second@example.com', password: 'password-123' });
  const request = await first.post('/api/requests').send({ recipientId: 2 });
  assert.equal((await first.get('/api/developers/2')).body.data.connection.direction, 'outgoing');
  await second.post(`/api/requests/${request.body.data.id}/reject`);
  assert.equal((await first.get('/api/developers/2')).body.data.connection, null);
});
