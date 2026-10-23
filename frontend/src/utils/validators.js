// Provides client-side validation that mirrors the backend's accepted input rules.
import {
  BIO_MAX, DISPLAY_NAME_MAX, DISPLAY_NAME_MIN, EMAIL_MAX, EXPERIENCE_LEVELS,
  INTERESTS_MAX, MESSAGE_MAX, PASSWORD_MAX, PASSWORD_MIN, URL_MAX
} from '../constants.js';

/** Validates a display name using trimmed character count. */
export function validateDisplayName(value) {
  return value.trim().length >= DISPLAY_NAME_MIN && value.trim().length <= DISPLAY_NAME_MAX ? '' : `Use ${DISPLAY_NAME_MIN} to ${DISPLAY_NAME_MAX} characters.`;
}
/** Validates a normalized email address. */
export function validateEmail(value) {
  const normalized = value.trim();
  return normalized.length <= EMAIL_MAX && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized) ? '' : 'Enter a valid email address.';
}
/** Validates a password without trimming it. */
export function validatePassword(value) {
  return value.length >= PASSWORD_MIN && value.length <= PASSWORD_MAX ? '' : `Use ${PASSWORD_MIN} to ${PASSWORD_MAX} characters.`;
}
/** Validates required profile fields. */
export function validateProfile(profile) {
  const errors = {};
  const displayNameError = validateDisplayName(profile.displayName);
  if (displayNameError) errors.displayName = displayNameError;
  if (!profile.bio.trim() || profile.bio.trim().length > BIO_MAX) errors.bio = `Use 1 to ${BIO_MAX} characters.`;
  if (!EXPERIENCE_LEVELS.some(({ value }) => value === profile.experienceLevel)) errors.experienceLevel = 'Choose a valid experience level.';
  if (profile.interests.trim().length > INTERESTS_MAX) errors.interests = `Use no more than ${INTERESTS_MAX} characters.`;
  for (const field of ['githubUrl', 'portfolioUrl']) {
    const value = profile[field].trim();
    if (value.length > URL_MAX || (value && !/^https?:\/\/\S+$/.test(value))) errors[field] = 'Enter a valid HTTP or HTTPS URL.';
  }
  return errors;
}
/** Validates a collaboration request message. */
export function validateRequestMessage(value) {
  return value.trim().length <= MESSAGE_MAX ? '' : `Use no more than ${MESSAGE_MAX} characters.`;
}
