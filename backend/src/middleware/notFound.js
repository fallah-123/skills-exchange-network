// Converts unmatched API URLs into the standard JSON error response.
import AppError from '../utils/AppError.js';

/**
 * Handles requests that did not match a registered route.
 * @param {import('express').Request} req HTTP request.
 * @param {import('express').Response} res HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void} Forwards the not-found error.
 * @throws {AppError} Forwards a not-found application error.
 */
export default function notFound(req, res, next) {
  next(new AppError(404, 'NOT_FOUND', 'The requested resource was not found.'));
}
