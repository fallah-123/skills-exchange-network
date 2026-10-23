// Converts expected and unexpected failures into safe, consistent JSON responses.
import AppError from '../utils/AppError.js';
import { error as logError } from '../utils/logger.js';

/**
 * Sends the standard API error response and keeps internal details server-side.
 * @param {Error & { type?: string }} error Reported failure.
 * @param {import('express').Request} req HTTP request.
 * @param {import('express').Response} res HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void} Sends a response or forwards an already-started response error.
 * @throws {Error} When a downstream error handler throws.
 */
export default function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const malformedJson = error.type === 'entity.parse.failed';
  if (malformedJson) {
    error = new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.');
  }

  error = mapDatabaseError(error);
  if (!(error instanceof AppError)) {
    logError(error);
    error = new AppError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  const payload = {
    error: {
      code: error.code,
      message: error.message
    }
  };
  if (error.code === 'VALIDATION_ERROR' && error.details) {
    payload.error.details = error.details;
  }
  res.status(error.status).json(payload);
}

function mapDatabaseError(databaseError) {
  if (databaseError.code === '23505') {
    if (databaseError.constraint === 'users_email_key') return new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    if (databaseError.constraint === 'developer_skills_pkey') return new AppError(409, 'SKILL_ALREADY_ADDED', 'This skill is already in that list.');
    if (databaseError.constraint === 'collaboration_requests_one_live_per_pair_key') {
      return new AppError(409, 'DUPLICATE_REQUEST', 'You already have a pending or accepted request with this developer.');
    }
  }
  if (databaseError.code === '23503' && databaseError.constraint === 'developer_skills_skill_fk') {
    return new AppError(404, 'SKILL_NOT_FOUND', 'The skill was not found.');
  }
  if (databaseError.code === '23503' && databaseError.constraint === 'collaboration_requests_recipient_fk') {
    return new AppError(404, 'USER_NOT_FOUND', 'The user was not found.');
  }
  if (databaseError.code === '23514' || databaseError.code === '23502') {
    return new AppError(400, 'VALIDATION_ERROR', 'Please correct the highlighted fields.');
  }
  return databaseError;
}
