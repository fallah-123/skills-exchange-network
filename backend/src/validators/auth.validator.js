// Validates and normalizes registration and login request bodies.
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, EMAIL_MAX, PASSWORD_MIN, PASSWORD_MAX } from '../constants.js';
import { throwValidationErrors } from './common.validator.js';

function readString(body, field, errors) {
  if (typeof body?.[field] !== 'string') {
    errors[field] = 'This field is required and must be text.';
    return '';
  }
  return body[field];
}

/**
 * Validates registration fields and returns normalized values.
 * @param {object} body Registration request body.
 * @returns {{displayName: string, email: string, password: string}} Normalized values.
 * @throws {AppError} When one or more fields are invalid.
 */
export function validateRegistration(body = {}) {
  const errors = {};
  const displayName = readString(body, 'displayName', errors).trim();
  const email = readString(body, 'email', errors).trim().toLowerCase();
  const password = readString(body, 'password', errors);
  if (displayName.length < DISPLAY_NAME_MIN || displayName.length > DISPLAY_NAME_MAX) errors.displayName = 'Use 2 to 50 characters.';
  if (email.length > EMAIL_MAX || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) errors.password = 'Use 8 to 128 characters.';
  throwValidationErrors(errors);
  return { displayName, email, password };
}

/**
 * Validates login fields and returns normalized values.
 * @param {object} body Login request body.
 * @returns {{email: string, password: string}} Normalized values.
 * @throws {AppError} When one or more fields are invalid.
 */
export function validateLogin(body = {}) {
  const errors = {};
  const email = readString(body, 'email', errors).trim().toLowerCase();
  const password = readString(body, 'password', errors);
  if (email.length > EMAIL_MAX || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) errors.password = 'Use 8 to 128 characters.';
  throwValidationErrors(errors);
  return { email, password };
}
