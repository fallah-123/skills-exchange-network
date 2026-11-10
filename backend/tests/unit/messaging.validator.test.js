import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  validateOpenConversation, validateSendMessage, validateConversationQuery, validateMessageQuery
} from '../../src/validators/messaging.validator.js';

test('chat validation normalizes text and UUIDs without allowing claimed sender identities', () => {
  const uuid = randomUUID();
  assert.deepEqual(validateSendMessage({ body: '  Hello\nworld  ', clientMessageId: uuid.toUpperCase() }), { body: 'Hello\nworld', clientMessageId: uuid });
  assert.throws(() => validateSendMessage({ body: 'Hello', clientMessageId: uuid, senderId: 2 }), { code: 'VALIDATION_ERROR' });
  assert.equal(validateOpenConversation({ requestId: 7 }), 7);
  for (const body of [null, [], { requestId: '7' }, { requestId: 0 }, { requestId: 7, createdAt: 'now' }]) {
    assert.throws(() => validateOpenConversation(body), { code: 'VALIDATION_ERROR' });
  }
});

test('chat validation matches Unicode code-point length and rejects text PostgreSQL cannot preserve', () => {
  const clientMessageId = randomUUID();
  assert.equal(validateSendMessage({ body: '😀'.repeat(2000), clientMessageId }).body, '😀'.repeat(2000));
  for (const body of ['', '\t\n', '😀'.repeat(2001), 'a\0b', '\uD800', '\uDC00', '\uD800a']) {
    assert.throws(() => validateSendMessage({ body, clientMessageId }), { code: 'VALIDATION_ERROR' });
  }
});

test('chat cursor validation preserves bigint precision and rejects ambiguous query shapes', () => {
  assert.equal(validateMessageQuery({ after: '9007199254740993' }).after, '9007199254740993');
  assert.equal(validateMessageQuery({ before: '9223372036854775807' }).before, '9223372036854775807');
  assert.equal(validateMessageQuery({ after: '0' }).after, '0');
  for (const query of [{ before: '0' }, { after: '01' }, { after: '-1' }, { after: '1e3' },
    { after: '9223372036854775808' }, { after: ['1'] }, { after: {} }, { before: '2', after: '1' }, { limit: '101' }]) {
    assert.throws(() => validateMessageQuery(query), { code: 'VALIDATION_ERROR' });
  }
});

test('conversation pagination is bounded and accepts only scalar integer query strings', () => {
  assert.deepEqual(validateConversationQuery(), { page: 1, limit: 20 });
  assert.deepEqual(validateConversationQuery({ page: '2', limit: '50' }), { page: 2, limit: 50 });
  for (const query of [{ page: '10001' }, { limit: '51' }, { page: ['1'] }, { limit: '1.5' }, { page: '0' }]) {
    assert.throws(() => validateConversationQuery(query), { code: 'VALIDATION_ERROR' });
  }
});
