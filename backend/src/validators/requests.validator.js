// Validates collaboration request payloads and status filters.
import { MESSAGE_MAX, REQUEST_STATUS } from '../constants.js';
import { throwValidationErrors, isValidId } from './common.validator.js';

/**
 * Validates recipient and optional message fields for request creation.
 * @param {object} body Raw create-request payload.
 * @returns {{recipientId: number, message: string|null}} Normalized request.
 * @throws {AppError} When recipient or message is invalid.
 */
export function validateCreateRequest(body = {}) {
  body = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const errors = {};
  if (!isValidId(body.recipientId)) errors.recipientId = 'Enter a positive integer recipient id.';
  let message = null;
  if (body.message !== undefined) {
    if (typeof body.message !== 'string') errors.message = 'This field must be text.';
    else {
      message = body.message.trim() || null;
      if (message && message.length > MESSAGE_MAX) errors.message = 'Use no more than 500 characters.';
    }
  }
  throwValidationErrors(errors);
  return { recipientId: body.recipientId, message };
}

/**
 * Validates an optional request-state filter.
 * @param {string|undefined} status Raw query value.
 * @returns {string|undefined} Valid state or undefined.
 * @throws {AppError} When the filter is not a supported request state.
 */
export function validateRequestStatus(status) {
  if (status === undefined) return undefined;
  if (Object.values(REQUEST_STATUS).includes(status)) return status;
  throwValidationErrors({ status: 'Choose pending, accepted, or rejected.' });
}
