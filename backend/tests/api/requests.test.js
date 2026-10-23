// API tests for request creation, visibility, decision, and state validation.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

async function registerAndLogin(agent, displayName, email) {
  await agent.post('/api/auth/register').send({ displayName, email, password: 'password-123' });
  await agent.post('/api/auth/login').send({ email, password: 'password-123' });
}

test('creates a request, rejects duplicates, and responds atomically', async () => {
  const sender = createApi().agent;
  const recipient = createApi().agent;
  await registerAndLogin(sender, 'Sender User', 'sender@example.com');
  await registerAndLogin(recipient, 'Recipient User', 'recipient@example.com');
  const created = await sender.post('/api/requests').send({ recipientId: 2, message: 'Let us collaborate.' });
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, 'pending');
  assert.equal(created.body.data.counterpart.displayName, 'Recipient User');
  assert.equal((await recipient.get('/api/requests/incoming')).body.data[0].counterpart.displayName, 'Sender User');
  assert.equal((await sender.get('/api/requests/outgoing')).body.data[0].counterpart.displayName, 'Recipient User');
  assert.equal((await sender.post('/api/requests').send({ recipientId: 2 })).status, 409);
  assert.equal((await sender.post(`/api/requests/${created.body.data.id}/accept`)).status, 403);
  const accepted = await recipient.post(`/api/requests/${created.body.data.id}/accept`);
  assert.equal(accepted.body.data.status, 'accepted');
  assert.equal((await recipient.post(`/api/requests/${created.body.data.id}/accept`)).body.error.code, 'INVALID_STATE');
  assert.equal((await sender.post('/api/requests').send({ recipientId: 2 })).status, 409);
});

test('validates self request, missing recipients, and request status filters', async () => {
  const { agent } = createApi();
  await registerAndLogin(agent, 'Sender User', 'sender@example.com');
  assert.equal((await agent.post('/api/requests').send({ recipientId: 1 })).body.error.code, 'SELF_REQUEST');
  assert.equal((await agent.post('/api/requests').send({ recipientId: 999 })).status, 404);
  assert.equal((await agent.get('/api/requests/incoming?status=bad')).status, 400);
});

test('blocks opposite-direction duplicates, hides requests from third parties, and permits retry after rejection', async () => {
  const sender = createApi().agent;
  const recipient = createApi().agent;
  const outsider = createApi().agent;
  await registerAndLogin(sender, 'Sender User', 'sender@example.com');
  await registerAndLogin(recipient, 'Recipient User', 'recipient@example.com');
  await registerAndLogin(outsider, 'Outsider User', 'outsider@example.com');
  const first = await sender.post('/api/requests').send({ recipientId: 2 });
  assert.equal((await recipient.post('/api/requests').send({ recipientId: 1 })).status, 409);
  assert.equal((await outsider.post(`/api/requests/${first.body.data.id}/accept`)).status, 404);
  assert.equal((await outsider.get('/api/requests/outgoing')).body.data.length, 0);
  await recipient.post(`/api/requests/${first.body.data.id}/reject`);
  const retry = await sender.post('/api/requests').send({ recipientId: 2 });
  assert.equal(retry.status, 201);
  assert.equal((await sender.get('/api/requests/outgoing?status=pending')).body.data.length, 1);
  assert.equal((await recipient.get('/api/requests/incoming?status=rejected')).body.data.length, 1);
});
