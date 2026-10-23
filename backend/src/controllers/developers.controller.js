// Handles protected developer search, pagination, and public profile details.
import * as service from '../services/developers.service.js';
import { validatePathId } from '../validators/common.validator.js';
import { validateDeveloperQuery } from '../validators/developers.validator.js';

/**
 * Returns a paginated list of public developer profiles.
 * @param {import('express').Request} req Discovery request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends developer data and paging metadata.
 * @throws {AppError} When search or paging values are invalid.
 */
export async function list(req, res) {
  const query = validateDeveloperQuery(req.query);
  const result = await service.list(req.app.locals.pool, req.userId, query);
  res.status(200).json({
    data: result.developers,
    meta: { page: query.page, limit: query.limit, total: result.total }
  });
}

/**
 * Returns one public developer profile by positive integer id.
 * @param {import('express').Request} req Developer detail request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends the public profile.
 * @throws {AppError} When the id is invalid or the user is missing.
 */
export async function get(req, res) {
  const id = validatePathId(req.params.id);
  const developer = await service.get(req.app.locals.pool, req.userId, id);
  res.status(200).json({ data: developer });
}
