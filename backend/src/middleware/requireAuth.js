// Protects routes using only the server-managed session identity.
import AppError from '../utils/AppError.js';

/**
 * Requires a valid session and exposes its user id on the request.
 * @param {import('express').Request} req HTTP request.
 * @param {import('express').Response} res HTTP response.
 * @param {import('express').NextFunction} next Express continuation callback.
 * @returns {void} Continues with an authenticated request or an error.
 * @throws {AppError} When no session identity is available.
 */
export default function requireAuth(req, res, next) {
  if (!Number.isInteger(req.session?.userId) || req.session.userId <= 0) {
    return next(new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.'));
  }
  req.userId = req.session.userId;
  next();
}
