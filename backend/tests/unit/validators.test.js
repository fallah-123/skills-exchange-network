// Unit tests for strict request validation and normalized input behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistration, validateLogin } from '../../src/validators/auth.validator.js';
import { validateProfile } from '../../src/validators/profile.validator.js';
import { validateSkillBody } from '../../src/validators/skills.validator.js';
import { validateCreateRequest } from '../../src/validators/requests.validator.js';
import { validatePathId } from '../../src/validators/common.validator.js';

test('normalizes registration identity fields but preserves password whitespace', () => {
  assert.deepEqual(
    validateRegistration({ displayName: ' Dev ', email: ' DEV@EXAMPLE.COM ', password: ' 1234567 ' }),
    { displayName: 'Dev', email: 'dev@example.com', password: ' 1234567 ' }
  );
});

test('collects invalid registration field errors and rejects non-string values', () => {
  assert.throws(
    () => validateRegistration({ displayName: 7, email: {}, password: 'short' }),
    (error) => error.code === 'VALIDATION_ERROR' && Object.keys(error.details).length === 3
  );
});

test('validates full profile replacement and optional empty values', () => {
  const profile = validateProfile({
    displayName: 'Name',
    bio: 'Bio',
    experienceLevel: 'beginner',
    interests: '',
    githubUrl: ''
  });
  assert.equal(profile.interests, null);
  assert.equal(profile.githubUrl, null);
  assert.throws(() => validateProfile({ displayName: 'Name', bio: 'Bio', experienceLevel: 'Beginner' }));
});

test('requires JSON numeric skill and recipient ids and validates path ids', () => {
  assert.throws(() => validateSkillBody({ skillId: '3' }));
  assert.throws(() => validateCreateRequest({ recipientId: 0 }));
  assert.throws(() => validatePathId('2147483648'));
  assert.equal(validatePathId('9'), 9);
});

test('normalizes request messages and login email', () => {
  assert.deepEqual(validateCreateRequest({ recipientId: 4, message: ' hello ' }), { recipientId: 4, message: 'hello' });
  assert.deepEqual(validateLogin({ email: ' A@EXAMPLE.COM ', password: 'password' }), {
    email: 'a@example.com', password: 'password'
  });
});
