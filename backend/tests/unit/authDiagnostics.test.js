import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import { EventEmitter } from 'node:events';
import authDiagnostics from '../../src/middleware/authDiagnostics.js';

test('auth diagnostics correlate arrival and response using bounded generated IDs and safe fields', async () => {
  const records = [];
  const app = express();
  app.use(authDiagnostics(record => records.push(record)));
  app.post('/api/auth/login', (_, res) => res.status(429).send('limited'));
  const result = await request(app).post('/api/auth/login?email=private@example.test')
    .set('Cookie', 'secret-cookie').set('Authorization', 'secret-auth')
    .set('X-SDN-Auth-Request-Id', 'untrusted-id').set('rndr-id', 'untrusted-provider-id')
    .send({ email: 'private@example.test', password: 'secret-password', evidence: 'https://private.test' });
  assert.equal(result.status, 429);
  assert.equal(records.length, 2);
  const id = result.headers['x-sdn-auth-request-id'];
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
  for (const record of records) {
    assert.equal(record.correlationId, id);
    assert.equal(record.route, '/api/auth/login');
    assert.equal(record.method, 'POST');
    assert.equal(record.expressProcessed, true);
    assert.ok(Number.isFinite(Date.parse(record.timestamp)));
    assert.ok(record.timestamp.endsWith('Z'));
    assert.deepEqual(Object.keys(record).sort(), ['correlationId','event','expressProcessed','method','route','timestamp',
      ...(record.event === 'auth_request_completed' ? ['durationMs','status'] : [])].sort());
  }
  assert.equal(records[1].status, 429);
  assert.ok(records[1].durationMs >= 0);
  assert.doesNotMatch(JSON.stringify(records), /secret|private|untrusted|Cookie|Authorization/);
});

test('only intended auth method/route pairs are logged; normal statuses and provider headers survive', async () => {
  const records = [];
  const app = express();
  app.use(authDiagnostics(r => records.push(r)));
  app.use((req, res) => res.set('rndr-id', 'provider-response').status(401).end());
  for (const path of ['/api/auth/me', '/API/AUTH/ME/']) {
    const result = await request(app).get(path);
    assert.equal(result.headers['rndr-id'], 'provider-response');
    assert.equal(result.status, 401);
  }
  assert.equal(records.length, 4);
  assert.notEqual(records[0].correlationId, records[2].correlationId);
  for (const path of ['/api/auth/register', '/api/auth/logout', '/api/auth/login', '/api/profile', '/api/auth/me/extra']) {
    const result = await request(app).get(path);
    assert.equal(result.headers['x-sdn-auth-request-id'], undefined);
  }
  assert.equal(records.length, 4);
});

test('synchronous and asynchronous logging failures cannot interrupt responses', async () => {
  for (const write of [() => { throw new Error('sink down'); }, async () => { throw new Error('sink down'); }]) {
    const app = express(); app.use(authDiagnostics(write));
    app.get('/api/auth/me', (_, res) => res.json({ ok: true }));
    const result = await request(app).get('/api/auth/me');
    assert.equal(result.status, 200); assert.equal(result.body.ok, true);
  }
});

test('aborted requests record an incomplete outcome exactly once', () => {
  const records = [], res = new EventEmitter();
  res.setHeader = () => {};
  authDiagnostics(r => records.push(r))({ path: '/api/auth/me', method: 'GET' }, res, () => {});
  res.emit('close'); res.emit('finish');
  assert.equal(records.length, 2);
  assert.equal(records[1].event, 'auth_request_aborted');
  assert.equal(records[1].status, null);
});
