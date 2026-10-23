// Validates skill assignment bodies and category parameters.
import { SKILL_TYPES } from '../constants.js';
import { throwValidationErrors, isValidId } from './common.validator.js';

/**
 * Validates a skill assignment body and returns its numeric catalogue id.
 * @param {object} body Raw skill assignment body.
 * @returns {number} Catalogue skill identifier.
 * @throws {AppError} When skillId is not a positive JSON integer.
 */
export function validateSkillBody(body = {}) {
  body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  if (!isValidId(body.skillId)) errors.skillId = 'Enter a positive integer skill id.';
  throwValidationErrors(errors);
  return body.skillId;
}

/**
 * Validates the offered/wanted category used in skill operations.
 * @param {string} skillType Requested skill category.
 * @returns {string} Validated category.
 * @throws {AppError} When the category is unsupported.
 */
export function validateSkillType(skillType) {
  const errors = {};
  if (!SKILL_TYPES.includes(skillType)) errors.skillType = 'Choose offered or wanted.';
  throwValidationErrors(errors);
  return skillType;
}
