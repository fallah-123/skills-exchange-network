// Exercises the real frontend API modules through the Vite proxy using isolated sessions.
import assert from 'node:assert/strict';
import { ApiError } from '../src/api/client.js';
import { getCurrentUser, loginUser, logoutUser, registerUser } from '../src/api/auth.api.js';
import { updateMyProfile } from '../src/api/profile.api.js';
import { addSkill, getMySkills, listSkills, removeSkill } from '../src/api/skills.api.js';
import { getDeveloper, listDevelopers } from '../src/api/developers.api.js';
import { getMatches } from '../src/api/matches.api.js';
import { createRequest, listRequests, respondToRequest } from '../src/api/requests.api.js';
import { MAX_ENTITY_ID } from '../src/constants.js';

if (process.env.INTEGRATION_TARGET_IS_TEST_DB !== 'yes') {
  console.error('Refusing to run: set INTEGRATION_TARGET_IS_TEST_DB=yes only when Vite proxies to the guarded dev:test backend.');
  console.error("PowerShell: $env:INTEGRATION_TARGET_IS_TEST_DB='yes'; npm.cmd run check:integration");
  console.error('POSIX shell: INTEGRATION_TARGET_IS_TEST_DB=yes npm run check:integration');
  process.exit(1);
}

const proxyOrigin = 'http://localhost:5173';
const nativeFetch = globalThis.fetch.bind(globalThis);
const cookieJars = new Map([['anonymous', '']]);
let activeJar = 'anonymous';

globalThis.fetch = async (input, init = {}) => {
  const source = typeof input === 'string' ? input : input.url;
  const target = source.startsWith('/api') ? `${proxyOrigin}${source}` : source;
  const headers = new Headers(init.headers || {});
  const cookie = cookieJars.get(activeJar);
  if (cookie) headers.set('cookie', cookie);
  const response = await nativeFetch(target, { ...init, headers });
  const setCookies = response.headers.getSetCookie?.() || [];
  for (const setCookie of setCookies) {
    const [cookiePair, ...attributes] = setCookie.split(';');
    const [name, ...valueParts] = cookiePair.split('=');
    const value = valueParts.join('=');
    const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute));
    if (!value || expired) cookieJars.delete(activeJar);
    else cookieJars.set(activeJar, `${name}=${value}`);
  }
  return response;
};

async function asUser(name, action) {
  const previousJar = activeJar;
  activeJar = name;
  if (!cookieJars.has(name)) cookieJars.set(name, '');
  try {
    return await action();
  } finally {
    activeJar = previousJar;
  }
}

async function expectApiError(action, status, code) {
  let received;
  try {
    await action();
  } catch (error) {
    received = error;
  }
  assert.ok(received instanceof ApiError, `Expected ${code} API error.`);
  assert.equal(received.status, status);
  assert.equal(received.code, code);
  return received;
}

let passed = 0;
let failed = 0;
async function runStep(label, action) {
  try {
    await action();
    passed += 1;
    console.log(`PASS ${label}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${label}: ${error.message}`);
  }
}

const stamp = Date.now();
const password = 'Integration-Test-Password-123!';
const state = {
  userA: { displayName: `Integration A ${stamp}`, email: `check-${stamp}-a@example.test` },
  userB: { displayName: `Integration B ${stamp}`, email: `check-${stamp}-b@example.test` }
};

await runStep('1. Health proxy and unauthenticated error envelope', async () => {
  const response = await globalThis.fetch('/api/health');
  assert.equal(response.status, 200);
  const health = await response.json();
  assert.equal(health.data.status, 'ok');
  assert.equal(health.data.database, 'up');
  const meResponse = await globalThis.fetch('/api/auth/me');
  assert.equal(meResponse.status, 401);
  const envelope = await meResponse.json();
  assert.equal(envelope.error.code, 'UNAUTHENTICATED');
  assert.equal(typeof envelope.error.message, 'string');
  await expectApiError(() => getCurrentUser(), 401, 'UNAUTHENTICATED');
});

await runStep('2. Registration, duplicate email, and invalid login', async () => {
  const resultA = await asUser('user-a', () => registerUser({ ...state.userA, password }));
  const resultB = await asUser('user-b', () => registerUser({ ...state.userB, password }));
  state.userA.id = resultA.data.id;
  state.userB.id = resultB.data.id;
  await expectApiError(
    () => asUser('user-a', () => registerUser({ ...state.userA, password })),
    409,
    'EMAIL_TAKEN'
  );
  await expectApiError(
    () => asUser('user-a', () => loginUser({ email: state.userA.email, password: 'Wrong-Password-123!' })),
    401,
    'INVALID_CREDENTIALS'
  );
});

await runStep('3. Login and per-user session identity', async () => {
  for (const key of ['user-a', 'user-b']) {
    const user = key === 'user-a' ? state.userA : state.userB;
    await asUser(key, () => loginUser({ email: user.email, password }));
    const current = await asUser(key, () => getCurrentUser());
    assert.equal(current.data.id, user.id);
    assert.equal(current.data.email, user.email);
  }
});

await runStep('4. Profile persistence and server validation', async () => {
  for (const key of ['user-a', 'user-b']) {
    const user = key === 'user-a' ? state.userA : state.userB;
    const result = await asUser(key, () => updateMyProfile({
      displayName: user.displayName,
      bio: `Integration profile for ${user.displayName}.`,
      experienceLevel: 'intermediate',
      interests: 'Integration testing',
      githubUrl: '',
      portfolioUrl: ''
    }));
    assert.equal(result.data.isComplete, true);
  }
  const invalid = await expectApiError(
    () => asUser('user-a', () => updateMyProfile({
      displayName: state.userA.displayName,
      bio: 'Valid bio',
      experienceLevel: 'expert'
    })),
    400,
    'VALIDATION_ERROR'
  );
  assert.ok(invalid.details.experienceLevel);
});

let skillIds = [];
await runStep('5. Catalogue, skill add/remove, and expected failures', async () => {
  const catalogue = await asUser('user-a', () => listSkills());
  assert.ok(catalogue.data.length >= 4);
  skillIds = catalogue.data.slice(0, 4).map((skill) => skill.id);
  assert.equal(new Set(skillIds).size, 4);
  for (const skillId of skillIds.slice(0, 2)) await asUser('user-a', () => addSkill('offered', skillId));
  for (const skillId of skillIds.slice(2, 4)) await asUser('user-a', () => addSkill('wanted', skillId));
  for (const skillId of skillIds.slice(2, 4)) await asUser('user-b', () => addSkill('offered', skillId));
  for (const skillId of skillIds.slice(0, 2)) await asUser('user-b', () => addSkill('wanted', skillId));
  await expectApiError(
    () => asUser('user-a', () => addSkill('offered', skillIds[0])),
    409,
    'SKILL_ALREADY_ADDED'
  );
  await expectApiError(
    () => asUser('user-a', () => addSkill('offered', MAX_ENTITY_ID)),
    404,
    'SKILL_NOT_FOUND'
  );
  await asUser('user-a', () => removeSkill('offered', skillIds[1]));
  await asUser('user-a', () => addSkill('offered', skillIds[1]));
  const mine = await asUser('user-a', () => getMySkills());
  assert.equal(mine.data.offered.length, 2);
  assert.equal(mine.data.wanted.length, 2);
});

await runStep('6. Developer discovery and mutual match explanation', async () => {
  const developers = await asUser('user-a', () => listDevelopers({ page: 1, limit: 50 }));
  assert.ok(!developers.data.some((developer) => developer.id === state.userA.id));
  const search = await asUser('user-a', () => listDevelopers({ search: state.userB.displayName, page: 1, limit: 50 }));
  assert.ok(search.data.some((developer) => developer.id === state.userB.id));
  const detail = await asUser('user-a', () => getDeveloper(state.userB.id));
  assert.equal(detail.data.connection, null);
  assert.ok(detail.data.offeredSkills.length >= 2);
  const matches = await asUser('user-a', () => getMatches());
  const mutual = matches.data.find((match) => match.developer.id === state.userB.id);
  assert.ok(mutual);
  assert.equal(mutual.matchType, 'mutual');
  assert.equal(mutual.score, 100);
  assert.ok(mutual.explanation.length > 0);
});

await runStep('7. Request creation, authorization, response, and connection state', async () => {
  const created = await asUser('user-a', () => createRequest(state.userB.id, 'Let us exchange developer skills.'));
  state.requestId = created.data.id;
  await expectApiError(
    () => asUser('user-a', () => createRequest(state.userB.id, 'Duplicate request.')),
    409,
    'DUPLICATE_REQUEST'
  );
  await expectApiError(
    () => asUser('user-a', () => createRequest(state.userA.id, 'Self request.')),
    400,
    'SELF_REQUEST'
  );
  const incoming = await asUser('user-b', () => listRequests('incoming', 'pending'));
  const outgoing = await asUser('user-a', () => listRequests('outgoing', 'pending'));
  assert.ok(incoming.data.some((item) => item.id === state.requestId && item.status === 'pending'));
  assert.ok(outgoing.data.some((item) => item.id === state.requestId && item.status === 'pending'));
  await expectApiError(
    () => asUser('user-a', () => respondToRequest(state.requestId, 'accept')),
    403,
    'FORBIDDEN'
  );
  const accepted = await asUser('user-b', () => respondToRequest(state.requestId, 'accept'));
  assert.equal(accepted.data.status, 'accepted');
  await expectApiError(
    () => asUser('user-b', () => respondToRequest(state.requestId, 'accept')),
    409,
    'INVALID_STATE'
  );
  const detailA = await asUser('user-a', () => getDeveloper(state.userB.id));
  const detailB = await asUser('user-b', () => getDeveloper(state.userA.id));
  assert.equal(detailA.data.connection.status, 'accepted');
  assert.equal(detailB.data.connection.status, 'accepted');
});

await runStep('8. Logout invalidates the server session', async () => {
  await asUser('user-a', () => logoutUser());
  await expectApiError(() => asUser('user-a', () => getCurrentUser()), 401, 'UNAUTHENTICATED');
});

console.log(`Integration result: ${passed} passed, ${failed} failed.`);
if (failed > 0) process.exitCode = 1;
