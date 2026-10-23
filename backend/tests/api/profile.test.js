// API tests for own-profile creation, replacement updates, and validation.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

test('creates an empty profile and persists full replacement update', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  await testPool.query(
    `INSERT INTO users (display_name, email, password_hash)
     VALUES ('Second User', 'second@example.com', 'hash')`
  );
  await testPool.query('INSERT INTO developer_profiles (user_id) VALUES (2)');
  assert.equal((await agent.get('/api/profile/me')).body.data.isComplete, false);
  const updated = await agent.put('/api/profile/me').send({
    displayName: 'Updated User', bio: 'A developer', experienceLevel: 'intermediate',
    interests: '', githubUrl: 'https://github.com/example', userId: 999
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.data.isComplete, true);
  assert.equal(updated.body.data.userId, 1);
  assert.equal(updated.body.data.displayName, 'Updated User');
  assert.equal(updated.body.data.interests, null);
  assert.equal((await agent.get('/api/profile/me')).body.data.bio, 'A developer');
  const otherProfile = await testPool.query('SELECT bio, display_name FROM developer_profiles JOIN users ON users.id = user_id WHERE user_id = 2');
  assert.equal(otherProfile.rows[0].bio, null);
  assert.equal(otherProfile.rows[0].display_name, 'Second User');
});

test('collects profile errors and does not accept invalid enums or URL schemes', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  const response = await agent.put('/api/profile/me').send({
    displayName: 'First User', bio: 'x'.repeat(501), experienceLevel: 'Beginner', githubUrl: 'javascript:bad'
  });
  assert.equal(response.status, 400);
  assert.deepEqual(Object.keys(response.body.error.details).sort(), ['bio', 'experienceLevel', 'githubUrl']);
});
