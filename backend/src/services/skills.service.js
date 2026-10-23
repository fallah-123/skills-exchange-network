// Enforces skill catalogue existence and assignment business rules.
import AppError from '../utils/AppError.js';
import * as skills from '../repositories/skills.repository.js';

/**
 * Returns the skill catalogue for an authenticated user.
 * @param {import('pg').Pool} pool Database pool.
 * @returns {Promise<object[]>} Catalogue skills.
 * @throws {Error} When the database query fails.
 */
export async function getCatalogue(pool) {
  return skills.listCatalogue(pool);
}

/**
 * Returns the authenticated user's offered and wanted lists.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Skill owner.
 * @returns {Promise<{offered: object[], wanted: object[]}>} Independent lists.
 * @throws {Error} When a database query fails.
 */
export async function getMine(pool, userId) {
  const [offered, wanted] = await Promise.all([
    skills.listForUser(pool, userId, 'offered'),
    skills.listForUser(pool, userId, 'wanted')
  ]);
  return { offered, wanted };
}

/**
 * Assigns a catalogue skill to the requested user category.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Skill owner.
 * @param {number} skillId Catalogue identifier.
 * @param {'offered'|'wanted'} skillType Assignment category.
 * @returns {Promise<object>} Added skill.
 * @throws {AppError} When the skill is missing or already assigned.
 */
export async function addSkill(pool, userId, skillId, skillType) {
  const skill = await skills.findById(pool, skillId);
  if (!skill) throw new AppError(404, 'SKILL_NOT_FOUND', 'The skill was not found.');
  await skills.addForUser(pool, userId, skillId, skillType);
  return skill;
}

/**
 * Removes a skill assignment from the requested category.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Skill owner.
 * @param {number} skillId Catalogue identifier.
 * @param {'offered'|'wanted'} skillType Assignment category.
 * @returns {Promise<void>} Resolves after removal.
 * @throws {AppError} When the assignment does not exist.
 */
export async function removeSkill(pool, userId, skillId, skillType) {
  const removed = await skills.removeForUser(pool, userId, skillId, skillType);
  if (!removed) throw new AppError(404, 'SKILL_NOT_ASSIGNED', 'This skill is not in your list.');
}
