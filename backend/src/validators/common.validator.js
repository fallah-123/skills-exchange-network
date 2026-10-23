// Shared input validation primitives used by all API validators.
import AppError from '../utils/AppError.js';

/**
 * Throws a standard validation error containing all collected field errors.
 * @param {Record<string, string>} details Field errors.
 * @returns {void} Returns when no errors were collected.
 * @throws {AppError} When details contains validation failures.
 */
export function throwValidationErrors(details) {
  if (Object.keys(details).length) {
    throw new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.', details);
  }
}

/**
 * Checks whether an id is a positive PostgreSQL int4 value.
 * @param {unknown} value Candidate numeric id.
 * @returns {boolean} Whether the value is a valid positive int4.
 */
export function isValidId(value) {
  return Number.isInteger(value) && value > 0 && value <= 2147483647;
}

/**
 * Validates a path id and returns its numeric value.
 * @param {string} value Raw path segment.
 * @param {string} [field] Validation field name.
 * @returns {number} Parsed id.
 * @throws {AppError} When the id is outside positive int4 range.
 */
export function validatePathId(value, field = 'id') {
  const id = Number(value);
  const details = {};
  if (!/^[1-9]\d*$/.test(value) || !isValidId(id)) details[field] = 'Enter a valid positive integer.';
  throwValidationErrors(details);
  return id;
}

/**
 * Validates a numeric query parameter and returns its positive integer value.
 * @param {string|undefined} value Raw query value.
 * @param {string} field Validation field name.
 * @param {number} fallback Default value when omitted.
 * @param {number} maximum Maximum permitted value.
 * @returns {number} Validated positive integer.
 * @throws {AppError} When a provided value is invalid.
 */
export function validatePositiveQuery(value, field, fallback, maximum) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  const details = {};
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(parsed) || parsed > maximum) {
    details[field] = `Enter a positive integer no greater than ${maximum}.`;
  }
  throwValidationErrors(details);
  return parsed;
}
