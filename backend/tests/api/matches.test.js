// API tests for ranked matching output and empty-skill metadata.
import test, { beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApi } from '../helpers/api.js';
import { resetTestDatabase, testPool } from '../helpers/testDb.js';
import { createSkill, assignSkill } from '../helpers/factories.js';

beforeEach(resetTestDatabase);
after(() => testPool.end());

test('returns deterministic matching results and reports empty lists', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'Current User', email: 'current@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'current@example.com', password: 'password-123' });
  const candidateAgent = createApi().agent;
  await candidateAgent.post('/api/auth/register').send({ displayName: 'Candidate User', email: 'candidate@example.com', password: 'password-123' });
  const [shared, offered] = await Promise.all([createSkill('Python'), createSkill('React')]);
  await assignSkill(1, shared.id, 'wanted');
  await assignSkill(2, shared.id, 'offered');
  await assignSkill(1, offered.id, 'offered');
  await assignSkill(2, offered.id, 'wanted');
  const first = await agent.get('/api/matches');
  const second = await agent.get('/api/matches');
  assert.equal(first.status, 200);
  assert.equal(first.body.data[0].matchType, 'mutual');
  assert.equal(first.body.data.some(({ developer }) => developer.id === 1), false);
  assert.deepEqual(first.body, second.body);
});

test('returns an empty successful result when the current user has no skills', async () => {
  const { agent } = createApi();
  await agent.post('/api/auth/register').send({ displayName: 'Current User', email: 'current@example.com', password: 'password-123' });
  await agent.post('/api/auth/login').send({ email: 'current@example.com', password: 'password-123' });
  const response = await agent.get('/api/matches');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data, []);
  assert.equal(response.body.meta.hasWantedSkills, false);
});

test('returns one-way matches and excludes candidates with no matching skill ids', async () => {
  const learner = createApi().agent;
  await learner.post('/api/auth/register').send({ displayName: 'Learner User', email: 'learner@example.com', password: 'password-123' });
  await learner.post('/api/auth/login').send({ email: 'learner@example.com', password: 'password-123' });
  const candidate = createApi().agent;
  await candidate.post('/api/auth/register').send({ displayName: 'Candidate User', email: 'candidate@example.com', password: 'password-123' });
  const unrelated = createApi().agent;
  await unrelated.post('/api/auth/register').send({ displayName: 'Unrelated User', email: 'unrelated@example.com', password: 'password-123' });
  const python = await createSkill('Python');
  const rust = await createSkill('Rust');
  await assignSkill(1, python.id, 'wanted');
  await assignSkill(2, python.id, 'offered');
  await assignSkill(3, rust.id, 'offered');
  const response = await learner.get('/api/matches');
  assert.equal(response.body.data.length, 1);
  assert.equal(response.body.data[0].matchType, 'they_offer');
  await testPool.query('DELETE FROM developer_skills WHERE user_id = 2 AND skill_id = $1', [python.id]);
  assert.deepEqual((await learner.get('/api/matches')).body.data, []);
});
