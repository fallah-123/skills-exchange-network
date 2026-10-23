// API tests for the catalogue and caller-owned offered/wanted skill lists.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';
import { createSkill } from '../helpers/factories.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

test('adds offered and wanted independently, rejects duplicates, and removes assignments', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  const skill = await createSkill('JavaScript');
  assert.equal((await agent.post('/api/skills/me/offered').send({ skillId: skill.id })).status, 201);
  assert.equal((await agent.post('/api/skills/me/wanted').send({ skillId: skill.id })).status, 201);
  assert.equal((await agent.post('/api/skills/me/offered').send({ skillId: skill.id })).status, 409);
  assert.equal((await agent.get('/api/skills/me')).body.data.offered.length, 1);
  assert.equal((await agent.get('/api/skills/me')).body.data.wanted.length, 1);
  assert.equal((await agent.delete(`/api/skills/me/offered/${skill.id}`)).status, 200);
  assert.equal((await agent.delete(`/api/skills/me/offered/${skill.id}`)).status, 404);
});

test('rejects string ids and unknown catalogue skills', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  assert.equal((await agent.post('/api/skills/me/offered').send({ skillId: '1' })).status, 400);
  assert.equal((await agent.post('/api/skills/me/offered').send({ skillId: 100 })).status, 404);
});

test('does not expose or remove another user skill assignments', async () => {
  const first = createApi().agent;
  await first.post('/api/auth/register').send({ displayName: 'First User', email: 'first@example.com', password: 'password-123' });
  await first.post('/api/auth/login').send({ email: 'first@example.com', password: 'password-123' });
  const skill = await createSkill('TypeScript');
  await testPool.query(
    'INSERT INTO developer_skills (user_id, skill_id, skill_type) VALUES (1, $1, $2)',
    [skill.id, 'offered']
  );
  const second = createApi().agent;
  await second.post('/api/auth/register').send({ displayName: 'Second User', email: 'second@example.com', password: 'password-123' });
  await second.post('/api/auth/login').send({ email: 'second@example.com', password: 'password-123' });
  assert.deepEqual((await second.get('/api/skills/me')).body.data.offered, []);
  assert.equal((await second.delete(`/api/skills/me/offered/${skill.id}`)).status, 404);
});
