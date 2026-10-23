// API and database-integrity tests for concurrent safety and persisted state.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';
import { createSkill, assignSkill } from '../helpers/factories.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

test('concurrent duplicate requests are constrained by PostgreSQL', async () => {
  const sender = createApi().agent;
  const recipient = createApi().agent;
  await sender.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await sender.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  await recipient.post('/api/auth/register').send({ displayName: 'Second User', email: 'second@example.com', password: 'password-123' });
  const [first, second] = await Promise.all([
    sender.post('/api/requests').send({ recipientId: 2 }),
    sender.post('/api/requests').send({ recipientId: 2 })
  ]);
  assert.deepEqual([first.status, second.status].sort(), [201, 409]);
});

test('database trigger rejects changing a decided request back to pending', async () => {
  await testPool.query(
    `INSERT INTO users (display_name, email, password_hash)
     VALUES ('First User', 'first@example.com', 'hash'), ('Second User', 'second@example.com', 'hash')`
  );
  await testPool.query('INSERT INTO developer_profiles (user_id) VALUES (1), (2)');
  await testPool.query(
    `INSERT INTO collaboration_requests (sender_id, recipient_id, status)
     VALUES (1, 2, 'accepted')`
  );
  await assert.rejects(
    testPool.query(`UPDATE collaboration_requests SET status = 'pending' WHERE id = 1`),
    (error) => error.code === '23514'
  );
});

test('a new app instance reads persisted account data and can log in', async () => {
  const firstApp = createApi();
  await firstApp.agent.post('/api/auth/register').send({
    displayName: 'Restart User', email: 'restart@example.com', password: 'password-123'
  });
  const { Pool } = await import('pg');
  const env = (await import('../../src/config/env.js')).default;
  const restartedPool = new Pool({
    host: env.database.host,
    port: env.database.port,
    database: env.database.name,
    user: env.database.user,
    password: env.database.password
  });
  try {
    const { createApp } = await import('../../src/app.js');
    const supertest = (await import('supertest')).default;
    const restartedAgent = supertest.agent(createApp(restartedPool));
    const loggedIn = await restartedAgent.post('/api/auth/login').send({
      email: 'restart@example.com', password: 'password-123'
    });
    assert.equal(loggedIn.status, 200);
  } finally {
    await restartedPool.end();
  }
});

test('smoke test completes registration, profile, skills, discovery, matching, and acceptance', async () => {
  const learner = createApi().agent;
  const mentor = createApi().agent;
  await learner.post('/api/auth/register').send({ displayName: 'Learner One', email: 'learner@example.com', password: 'password-123' });
  await learner.post('/api/auth/login').send({ email: 'learner@example.com', password: 'password-123' });
  await mentor.post('/api/auth/register').send({ displayName: 'Mentor Two', email: 'mentor@example.com', password: 'password-123' });
  await mentor.post('/api/auth/login').send({ email: 'mentor@example.com', password: 'password-123' });
  await learner.put('/api/profile/me').send({ displayName: 'Learner One', bio: 'Learning backend work.', experienceLevel: 'beginner' });
  await mentor.put('/api/profile/me').send({ displayName: 'Mentor Two', bio: 'Building backend systems.', experienceLevel: 'advanced' });
  const python = await createSkill('Python');
  const react = await createSkill('React');
  await assignSkill(1, react.id, 'offered');
  await assignSkill(1, python.id, 'wanted');
  await assignSkill(2, python.id, 'offered');
  await assignSkill(2, react.id, 'wanted');
  assert.equal((await learner.get('/api/developers')).body.data.length, 1);
  assert.equal((await learner.get('/api/matches')).body.data[0].matchType, 'mutual');
  const request = await learner.post('/api/requests').send({ recipientId: 2, message: 'Let us build something.' });
  assert.equal(request.status, 201);
  assert.equal((await mentor.post(`/api/requests/${request.body.data.id}/accept`)).body.data.status, 'accepted');
  assert.equal((await learner.get('/api/developers/2')).body.data.connection.status, 'accepted');
});
