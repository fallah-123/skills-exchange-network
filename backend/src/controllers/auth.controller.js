// Handles authentication HTTP requests and session lifecycle.
import * as auth from '../services/auth.service.js';
import * as validator from '../validators/auth.validator.js';
import AppError from '../utils/AppError.js';
import { SESSION_COOKIE_NAME } from '../constants.js';

/**
 * Registers an account without creating a login session.
 * @param {import('express').Request} req Registration request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the registered public user.
 * @throws {AppError} When registration input is invalid.
 */
export async function register(req, res) {
  const fields = validator.validateRegistration(req.body);
  const user = await auth.register(req.app.locals.pool, fields);
  res.status(201).json({ data: user, message: 'Registration successful. Please log in.' });
}

/**
 * Authenticates credentials and regenerates the session identifier.
 * @param {import('express').Request} req Login request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the public user and sets a session cookie.
 * @throws {AppError} When validation fails or credentials are invalid.
 */
export async function login(req, res) {
  const fields = validator.validateLogin(req.body);
  const user = await auth.login(req.app.locals.pool, fields);
  await new Promise((resolve, reject) => req.session.regenerate((sessionError) => sessionError ? reject(sessionError) : resolve()));
  req.session.userId = user.id;
  await new Promise((resolve, reject) => req.session.save((sessionError) => sessionError ? reject(sessionError) : resolve()));
  res.status(200).json({ data: user, message: 'Logged in successfully.' });
}

/**
 * Destroys the current session and expires the session cookie.
 * @param {import('express').Request} req Authenticated request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the logout confirmation.
 * @throws {Error} When session storage cannot destroy the session.
 */
export async function logout(req, res) {
  await new Promise((resolve, reject) => req.session.destroy((sessionError) => sessionError ? reject(sessionError) : resolve()));
  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: 'lax',
    secure: req.app.get('env') === 'production'
  });
  res.status(200).json({ message: 'Logged out.' });
}

/**
 * Returns the authenticated public user and invalidates stale sessions.
 * @param {import('express').Request} req Authenticated request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the public user or an authentication error.
 * @throws {AppError} When the session refers to a deleted account.
 */
export async function me(req, res) {
  const user = await auth.getCurrentUser(req.app.locals.pool, req.userId);
  if (!user) {
    await new Promise((resolve, reject) => req.session.destroy((sessionError) => sessionError ? reject(sessionError) : resolve()));
    throw new AppError(401, 'UNAUTHENTICATED', 'Please log in to continue.');
  }
  res.status(200).json({ data: user });
}
