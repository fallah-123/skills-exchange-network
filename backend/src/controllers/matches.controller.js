// Validates match limits and returns ranked matches with availability metadata.
import * as service from '../services/matches.service.js';
import { DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT } from '../constants.js';
import { validatePositiveQuery } from '../validators/common.validator.js';

/**
 * Returns the caller's ranked developer matches.
 * @param {import('express').Request} req Match request.
 * @param {import('express').Response} res HTTP response.
 * @returns {Promise<void>} Sends matches and skill metadata.
 * @throws {AppError} When the limit query parameter is invalid.
 */
export async function list(req, res) {
  const limit = validatePositiveQuery(req.query.limit, 'limit', DEFAULT_MATCH_LIMIT, MAX_MATCH_LIMIT);
  const result = await service.getMatches(req.app.locals.pool, req.userId, limit);
  res.status(200).json({
    data: result.data,
    meta: { count: result.data.length, hasOfferedSkills: result.hasOfferedSkills, hasWantedSkills: result.hasWantedSkills }
  });
}
