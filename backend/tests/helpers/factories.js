// Creates real test-database fixtures for API tests.
import argon2 from 'argon2';
import { testPool } from './testDb.js';

/** Inserts a synthetic user and its required empty profile in the test database. */
export async function createUser({ displayName = 'Test Developer', email, password = 'test-password-123' }) {
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  const result = await testPool.query(
    `INSERT INTO users (display_name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, display_name AS "displayName", email`,
    [displayName, email.toLowerCase(), hash]
  );
  const user = result.rows[0];
  await testPool.query('INSERT INTO developer_profiles (user_id) VALUES ($1)', [user.id]);
  return { ...user, password };
}

/** Inserts a skill catalogue entry in the test database. */
export async function createSkill(name) {
  const result = await testPool.query(
    'INSERT INTO skills (name) VALUES ($1) RETURNING id, name',
    [name]
  );
  return result.rows[0];
}

/** Assigns a test skill to a user as offered or wanted. */
export async function assignSkill(userId, skillId, skillType) {
  await testPool.query(
    'INSERT INTO developer_skills (user_id, skill_id, skill_type) VALUES ($1, $2, $3)',
    [userId, skillId, skillType]
  );
}
