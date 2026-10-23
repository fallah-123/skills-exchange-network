// Implements registration and login business rules with Argon2id.
import argon2 from 'argon2';
import AppError from '../utils/AppError.js';
import { withTransaction } from '../db/transaction.js';
import * as users from '../repositories/users.repository.js';

const dummyPasswordHash = argon2.hash('fixed-invalid-account-password', { type: argon2.argon2id });

/**
 * Creates an account and its initially empty profile in one transaction.
 * @param {import('pg').Pool} pool Database pool.
 * @param {{displayName: string, email: string, password: string}} fields Validated registration.
 * @returns {Promise<object>} Public account fields.
 * @throws {Error} When hashing or transactional persistence fails.
 */
export async function register(pool, fields) {
  const passwordHash = await argon2.hash(fields.password, { type: argon2.argon2id });
  return withTransaction(pool, async (client) => {
    const user = await users.insertUser(client, { ...fields, passwordHash });
    await client.query('INSERT INTO developer_profiles (user_id) VALUES ($1)', [user.id]);
    return user;
  });
}

/**
 * Verifies credentials, performing a dummy hash verification for unknown emails.
 * @param {import('pg').Pool} pool Database pool.
 * @param {{email: string, password: string}} credentials Validated login.
 * @returns {Promise<object>} Public user fields.
 * @throws {AppError} When credentials do not match.
 */
export async function login(pool, { email, password }) {
  const user = await users.findByEmail(pool, email);
  const hash = user ? user.password_hash : await dummyPasswordHash;
  const validPassword = await argon2.verify(hash, password);
  if (!user || !validPassword) {
    throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password.');
  }
  return { id: user.id, displayName: user.display_name, email: user.email };
}

/**
 * Loads the authenticated account or returns null if it no longer exists.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Session user identifier.
 * @returns {Promise<object|null>} Public user or null.
 * @throws {Error} When the database query fails.
 */
export async function getCurrentUser(pool, userId) {
  return users.findPublicById(pool, userId);
}
