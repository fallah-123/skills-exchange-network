// Enforces profile retrieval and atomic full-replacement update behavior.
import AppError from '../utils/AppError.js';
import { withTransaction } from '../db/transaction.js';
import * as profiles from '../repositories/profiles.repository.js';
import * as users from '../repositories/users.repository.js';

/**
 * Retrieves the authenticated user's profile or reports a deleted account.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Profile owner.
 * @returns {Promise<object>} Own profile.
 * @throws {AppError} When the user or profile is missing.
 */
export async function getProfile(pool, userId) {
  const profile = await profiles.findByUserId(pool, userId);
  if (!profile) throw new AppError(404, 'USER_NOT_FOUND', 'The user was not found.');
  return profile;
}

/**
 * Replaces the authenticated user's public name and profile in one transaction.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Profile owner.
 * @param {object} fields Validated replacement fields.
 * @returns {Promise<object>} Updated own profile.
 * @throws {AppError} When the user or profile is missing.
 */
export async function saveProfile(pool, userId, fields) {
  await withTransaction(pool, async (client) => profiles.updateProfile(client, userId, fields));
  const profile = await profiles.findByUserId(pool, userId);
  if (!profile) throw new AppError(404, 'USER_NOT_FOUND', 'The user was not found.');
  return profile;
}
