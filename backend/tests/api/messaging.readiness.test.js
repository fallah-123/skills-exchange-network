import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { testPool } from '../helpers/testDb.js';
import { checkDatabaseReadiness } from '../../src/db/readiness.js';

after(() => testPool.end());

test('release readiness accepts the migrated schema', async () => {
  assert.deepEqual(await checkDatabaseReadiness(testPool), []);
});

test('release readiness detects disabled guards, RLS, missing indexes and leaked grants', async () => {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE public.messages DISABLE TRIGGER messages_guard_trg');
    await client.query('ALTER TABLE public.messages DISABLE ROW LEVEL SECURITY');
    await client.query('GRANT SELECT ON public.messages TO PUBLIC');
    await client.query('DROP INDEX public.messages_conversation_history_idx');
    const errors = await checkDatabaseReadiness(client);
    assert.ok(errors.includes('Missing or disabled trigger: messages_guard_trg'));
    assert.ok(errors.includes('RLS disabled: messages'));
    assert.ok(errors.includes('Missing or invalid index: messages_conversation_history_idx'));
    assert.ok(errors.includes('PUBLIC has messaging table or sequence privileges.'));
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

test('release readiness detects client policies and unsafe trigger function settings', async () => {
  const client = await testPool.connect();
  try {
    await client.query('BEGIN');
    await client.query('CREATE POLICY unexpected_access ON public.messages FOR SELECT USING (true)');
    await client.query('ALTER FUNCTION public.messaging_guard_message() SECURITY DEFINER');
    await client.query('ALTER FUNCTION public.messaging_guard_message() RESET search_path');
    await client.query('GRANT EXECUTE ON FUNCTION public.messaging_guard_message() TO PUBLIC');
    const errors = await checkDatabaseReadiness(client);
    assert.ok(errors.includes('Messaging tables must have no Data API policies.'));
    assert.ok(errors.includes('Messaging guard functions are missing or have unsafe permissions/search paths.'));
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
