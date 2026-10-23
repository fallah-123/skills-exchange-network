// Exposes skill catalogue and assignment API calls.
import { request } from './client.js';

/** Reads the full skill catalogue. */
export const listSkills = (signal) => request('GET', '/api/skills', { signal });
/** Reads the signed-in user's offered and wanted skills. */
export const getMySkills = (signal) => request('GET', '/api/skills/me', { signal });
/** Adds a catalogue skill to the selected category. */
export const addSkill = (type, skillId) => request('POST', `/api/skills/me/${encodeURIComponent(type)}`, { body: { skillId } });
/** Removes a skill from the selected category. */
export const removeSkill = (type, skillId) => request('DELETE', `/api/skills/me/${encodeURIComponent(type)}/${encodeURIComponent(skillId)}`);
