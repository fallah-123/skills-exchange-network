// Translates own-profile HTTP requests to profile services.
import * as profile from '../services/profile.service.js';
import { validateProfile } from '../validators/profile.validator.js';

/**
 * Returns the authenticated developer's private own-profile representation.
 * @param {import('express').Request} req Authenticated request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the caller's own profile.
 * @throws {AppError} When the caller's account no longer exists.
 */
export async function getOwnProfile(req, res) {
  const result = await profile.getProfile(req.app.locals.pool, req.userId);
  res.status(200).json({ data: result });
}

/**
 * Replaces the authenticated developer's profile fields.
 * @param {import('express').Request} req Profile update request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the updated profile.
 * @throws {AppError} When profile validation or persistence fails.
 */
export async function updateOwnProfile(req, res) {
  const fields = validateProfile(req.body);
  const result = await profile.saveProfile(req.app.locals.pool, req.userId, fields);
  res.status(200).json({ data: result, message: 'Profile updated.' });
}
