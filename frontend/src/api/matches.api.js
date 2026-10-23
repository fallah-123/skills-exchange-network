// Exposes recommended-developer API calls.
import { request } from './client.js';

/** Lists ranked skill-overlap recommendations. */
export const getMatches = (limit, signal) => request('GET', '/api/matches', { query: { limit }, signal });
