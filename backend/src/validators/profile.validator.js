// Validates full-replacement profile updates and optional profile fields.
import { BIO_MAX, DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, EXPERIENCE_LEVELS, INTERESTS_MAX, URL_MAX } from '../constants.js';
import { throwValidationErrors } from './common.validator.js';

function optionalText(body, field, maxLength, errors) {
  const value = body[field];
  if (value === undefined) return null;
  if (typeof value !== 'string') {
    errors[field] = 'This field must be text.';
    return null;
  }
  const cleaned = value.trim();
  if (cleaned.length > maxLength) errors[field] = `Use no more than ${maxLength} characters.`;
  return cleaned || null;
}

/**
 * Validates all profile fields and returns the complete replacement object.
 * @param {object} body Raw profile request.
 * @returns {object} Normalized full-replacement profile.
 * @throws {AppError} When any required or optional field is invalid.
 */
export function validateProfile(body = {}) {
  body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : '';
  const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
  const experienceLevel = body.experienceLevel;
  if (typeof body.displayName !== 'string' || displayName.length < DISPLAY_NAME_MIN || displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = 'Use 2 to 50 characters.';
  }
  if (typeof body.bio !== 'string' || bio.length < 1 || bio.length > BIO_MAX) {
    errors.bio = 'Use 1 to 500 characters.';
  }
  if (typeof experienceLevel !== 'string' || !EXPERIENCE_LEVELS.includes(experienceLevel)) {
    errors.experienceLevel = 'Choose a valid experience level.';
  }
  const interests = optionalText(body, 'interests', INTERESTS_MAX, errors);
  const githubUrl = optionalText(body, 'githubUrl', URL_MAX, errors);
  const portfolioUrl = optionalText(body, 'portfolioUrl', URL_MAX, errors);
  for (const [field, value] of [['githubUrl', githubUrl], ['portfolioUrl', portfolioUrl]]) {
    if (value !== null && !/^https?:\/\/\S+$/.test(value)) errors[field] = 'Enter a valid HTTP or HTTPS URL.';
  }
  throwValidationErrors(errors);
  return { displayName, bio, experienceLevel, interests, githubUrl, portfolioUrl };
}
