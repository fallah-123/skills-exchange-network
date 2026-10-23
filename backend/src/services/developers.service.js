// Implements public developer discovery rules and identifier validation.
import AppError from '../utils/AppError.js';
import * as developers from '../repositories/developers.repository.js';

/**
 * Lists developers excluding the caller, with public skill collections.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} currentUserId Caller identity.
 * @param {{search: string, page: number, limit: number}} query Validated list filters.
 * @returns {Promise<object>} Developer page and total.
 * @throws {Error} When a database query fails.
 */
export async function list(pool, currentUserId, query) {
  const result = await developers.listDevelopers(pool, currentUserId, query);
  const connections = await developers.loadConnections(pool, currentUserId, result.developers.map(({ id }) => id));
  return {
    ...result,
    developers: result.developers.map((developer) => ({
      ...developer,
      connection: connections.get(developer.id) ?? null
    }))
  };
}

/**
 * Returns one public developer profile, including the caller's own profile.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} currentUserId Caller identity.
 * @param {number} developerId Profile identifier.
 * @returns {Promise<object>} Public developer data and connection.
 * @throws {AppError} When the requested user does not exist.
 */
export async function get(pool, currentUserId, developerId) {
  const developer = await developers.findDeveloper(pool, developerId);
  if (!developer) throw new AppError(404, 'USER_NOT_FOUND', 'The user was not found.');
  const connections = await developers.loadConnections(pool, currentUserId, [developerId]);
  return { ...developer, connection: connections.get(developerId) ?? null };
}
