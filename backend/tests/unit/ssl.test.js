import test from 'node:test';
import assert from 'node:assert/strict';
import { databaseSsl } from '../../src/db/ssl.js';
import { X509Certificate } from 'node:crypto';

test('hosted databases verify TLS even during development; local test PostgreSQL can omit TLS', () => {
  assert.deepEqual(databaseSsl({ nodeEnv: 'development', host: 'db.example.test' }), { rejectUnauthorized: true });
  assert.deepEqual(databaseSsl({ nodeEnv: 'production', host: 'localhost' }), { rejectUnauthorized: true });
  assert.equal(databaseSsl({ nodeEnv: 'test', host: '127.0.0.1' }), false);
});

test('a configured trusted CA is loaded without disabling verification and unreadable files fail closed', () => {
  const config = { nodeEnv: 'production', host: 'db.example.test', caFile: '/trusted/provider.crt' };
  assert.deepEqual(databaseSsl(config, (file, encoding) => {
    assert.equal(file, config.caFile);
    assert.equal(encoding, 'utf8');
    return 'trusted CA';
  }), { rejectUnauthorized: true, ca: 'trusted CA' });
  assert.throws(() => databaseSsl(config, () => { throw new Error('unreadable'); }), /unreadable/);
});

test('Supabase hosts use the official bundled root; lookalike domains do not', () => {
  for (const host of ['db.projectref.supabase.co', 'aws-0-ap-south-1.pooler.supabase.com']) {
    const ssl = databaseSsl({ nodeEnv: 'production', host });
    assert.equal(ssl.rejectUnauthorized, true);
    const certificate = new X509Certificate(ssl.ca);
    assert.equal(certificate.ca, true);
    assert.equal(certificate.fingerprint256, '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA');
    assert.ok(new Date(certificate.validTo) > new Date());
  }
  assert.deepEqual(databaseSsl({ nodeEnv: 'production', host: 'db.projectref.supabase.co.attacker.test' }), { rejectUnauthorized: true });
});
