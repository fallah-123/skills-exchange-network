// Explicitly authorized academic-demo acceptance check. Creates disposable accounts
// and their records; never resets tables or modifies pre-existing accounts.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

if (process.env.LIVE_DEMO_CHECK !== 'approved') {
  throw new Error('Set LIVE_DEMO_CHECK=approved only with permission to create live demo records.');
}
const origin = 'https://frontend-eta-fawn-j8xf3k2cfw.vercel.app';
const actors = new Map();
const stamp = randomUUID();
let passed = 0;
function pass(label) { passed++; console.log(`PASS ${label}`); }
async function call(actor, path, method = 'GET', body, expected = 200, csrf = true) {
  const state = actors.get(actor);
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (state?.cookie) headers.Cookie = state.cookie;
  if (csrf && method === 'POST' && path.startsWith('/conversations') && state?.token) {
    headers['X-CSRF-Token'] = state.token;
  }
  const response = await fetch(`${origin}/api${path}`, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  });
  const result = await response.json();
  assert.equal(response.status, expected, `${method} ${path}: HTTP ${response.status}, ${result.error?.code ?? 'unexpected response'}`);
  for (const cookie of response.headers.getSetCookie()) {
    if (state) { state.cookie = cookie.split(';')[0]; state.lastCookie = cookie; }
  }
  return result;
}
async function login(actor) {
  const state = actors.get(actor);
  await call(actor, '/auth/login', 'POST', { email: state.email, password: state.password });
  for (const attribute of [/; Secure/i, /; HttpOnly/i, /; SameSite=Lax/i, /; Path=\//i]) {
    assert.match(state.lastCookie, attribute, 'Required production cookie attribute missing');
  }
  assert.doesNotMatch(state.lastCookie, /; Domain=/i);
  state.token = (await call(actor, '/conversations/csrf-token')).data.csrfToken;
}

try {
  assert.equal((await call(null, '/health')).data.database, 'up');
  await call(null, '/conversations', 'GET', undefined, 401);
  pass('HTTPS proxy, database health and anonymous messaging denial');

  for (const actor of ['a', 'b', 'outsider']) {
    const state = { displayName: `Academic Demo ${actor}`, email: `demo-${stamp}-${actor}@example.test`, password: `Demo-${randomUUID()}!` };
    actors.set(actor, state);
    state.id = (await call(actor, '/auth/register', 'POST', {
      displayName: state.displayName, email: state.email, password: state.password
    }, 201)).data.id;
    await login(actor);
    for (let i = 0; i < 2; i++) assert.equal((await call(actor, '/auth/me')).data.id, state.id);
  }
  pass('Registration, login, persisted sessions and Secure/HttpOnly/Lax host-only cookies');

  for (const actor of ['a', 'b']) {
    const state = actors.get(actor);
    const profile = { displayName: state.displayName, bio: 'Academic demonstration account.', experienceLevel: 'intermediate', interests: 'Skills exchange', githubUrl: '', portfolioUrl: '' };
    assert.equal((await call(actor, '/profile/me', 'PUT', profile)).data.isComplete, true);
    assert.equal((await call(actor, '/profile/me')).data.bio, profile.bio);
  }
  pass('Developer profile updates and persistence');

  const skills = (await call('a', '/skills')).data.slice(0, 4).map(s => s.id);
  assert.equal(skills.length, 4);
  for (let i = 0; i < skills.length; i++) {
    await call('a', `/skills/me/${i < 2 ? 'offered' : 'wanted'}`, 'POST', { skillId: skills[i] }, 201);
    await call('b', `/skills/me/${i < 2 ? 'wanted' : 'offered'}`, 'POST', { skillId: skills[i] }, 201);
  }
  await call('a', `/skills/me/offered/${skills[0]}`, 'DELETE');
  await call('a', '/skills/me/offered', 'POST', { skillId: skills[0] }, 201);
  const mine = (await call('a', '/skills/me')).data;
  assert.equal(mine.offered.length, 2); assert.equal(mine.wanted.length, 2);
  pass('Skills catalogue, assignment, removal and persistence');

  const partner = actors.get('b').id;
  const detail = (await call('a', `/developers/${partner}`)).data;
  assert.equal(detail.id, partner);
  const mutual = (await call('a', '/matches')).data.find(m => m.developer.id === partner);
  assert.ok(mutual); assert.equal(mutual.matchType, 'mutual'); assert.equal(mutual.score, 100);
  pass('Developer discovery and mutual skill matching');

  const requestId = (await call('a', '/requests', 'POST', { recipientId: partner, message: 'Academic demo collaboration.' }, 201)).data.id;
  await call('a', `/requests/${requestId}/accept`, 'POST', undefined, 403);
  assert.equal((await call('b', `/requests/${requestId}/accept`, 'POST')).data.status, 'accepted');
  const conversation = (await call('a', '/conversations', 'POST', { requestId }, 201)).data.id;
  assert.equal((await call('b', '/conversations', 'POST', { requestId })).data.id, conversation);
  pass('Collaboration authorization, acceptance and shared conversation');

  await call('outsider', `/conversations/${conversation}`, 'GET', undefined, 404);
  await call('outsider', `/conversations/${conversation}/messages`, 'GET', undefined, 404);
  await call('outsider', `/conversations/${conversation}/messages`, 'POST', { body: 'Unauthorized attempt', clientMessageId: randomUUID() }, 404);
  await call('a', `/conversations/${conversation}/messages`, 'POST', { body: 'Missing CSRF attempt', clientMessageId: randomUUID() }, 403, false);
  pass('Third-account conversation privacy and CSRF enforcement');

  const text = 'Academic demo \u{1F600}\u{1F680}\nSecond line\nThird line';
  const first = { body: text, clientMessageId: randomUUID() };
  const sent = (await call('a', `/conversations/${conversation}/messages`, 'POST', first, 201)).data;
  const retry = await call('a', `/conversations/${conversation}/messages`, 'POST', first);
  assert.equal(retry.data.id, sent.id); assert.equal(retry.meta.replayed, true);
  assert.equal((await call('b', `/conversations/${conversation}/messages`)).data[0].body, text);
  for (let i = 1; i < 35; i++) {
    await call(i % 2 ? 'b' : 'a', `/conversations/${conversation}/messages`, 'POST', { body: `Demo history ${i}`, clientMessageId: randomUUID() }, 201);
  }
  const latest = await call('b', `/conversations/${conversation}/messages?limit=30`);
  assert.equal(latest.data.length, 30); assert.equal(latest.meta.hasMore, true);
  const older = await call('b', `/conversations/${conversation}/messages?limit=30&before=${latest.meta.nextBefore}`);
  assert.equal(older.data.length, 5); assert.equal(older.data[0].body, text);
  assert.equal(new Set([...older.data, ...latest.data].map(m => m.id)).size, 35);
  const incremental = await call('b', `/conversations/${conversation}/messages?after=${sent.id}&limit=50`);
  assert.equal(incremental.data.length, 34);
  pass('Emoji/multiline messages, idempotent retry, incremental reads and all 35 history records');

  await call('a', '/auth/logout', 'POST');
  await call('a', '/auth/me', 'GET', undefined, 401);
  await login('a');
  assert.equal((await call('a', `/conversations/${conversation}/messages?before=${latest.meta.nextBefore}`)).data[0].body, text);
  assert.ok((await call('a', '/conversations')).data.some(c => c.id === conversation));
  pass('Logout denial, re-login and conversation history persistence');
  console.log(`Live acceptance: ${passed} groups passed. Created only disposable demo records; existing records untouched.`);
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  for (const actor of actors.keys()) {
    if (actors.get(actor).cookie) {
      try { await call(actor, '/auth/logout', 'POST'); }
      catch { console.error('Demo session cleanup was not confirmed.'); process.exitCode = 1; }
    }
  }
}
