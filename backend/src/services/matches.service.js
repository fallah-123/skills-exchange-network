// Coordinates candidate loading, pure scoring, and connection enrichment.
import { DEFAULT_MATCH_LIMIT } from '../constants.js';
import * as matches from '../repositories/matches.repository.js';
import { rankMatches } from './matching.service.js';

/**
 * Returns deterministic matches and skill-availability metadata for the caller.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} currentUserId Caller identity.
 * @param {number} [limit] Maximum number of results.
 * @returns {Promise<object>} Ranked matches and current skill flags.
 * @throws {Error} When a database query fails.
 */
export async function getMatches(pool, currentUserId, limit = DEFAULT_MATCH_LIMIT) {
  const { currentUser, candidates } = await matches.loadCandidates(pool, currentUserId);
  if (!currentUser) {
    return { data: [], hasOfferedSkills: false, hasWantedSkills: false };
  }
  const ranked = rankMatches(currentUser, candidates).slice(0, limit);
  const connections = await matches.loadConnections(pool, currentUserId, ranked.map(({ developer }) => developer.id));
  return {
    data: ranked.map((match) => ({
      ...match,
      connection: connections.get(match.developer.id) ?? null
    })),
    hasOfferedSkills: currentUser.offered.length > 0,
    hasWantedSkills: currentUser.wanted.length > 0
  };
}
