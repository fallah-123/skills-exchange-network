// Exposes developer discovery and profile API calls.
import { request } from './client.js';

/** Lists developers with optional name search and pagination. */
export const listDevelopers = (query, signal) => request('GET', '/api/developers', { query, signal });
/** Reads a developer profile by id. */
export const getDeveloper = (id, signal) => request('GET', `/api/developers/${encodeURIComponent(id)}`, { signal });
