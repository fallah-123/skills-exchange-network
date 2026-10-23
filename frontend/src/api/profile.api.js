// Exposes own-profile API calls using the shared same-origin client.
import { request } from './client.js';

/** Reads the signed-in user's profile. */
export const getMyProfile = (signal) => request('GET', '/api/profile/me', { signal });
/** Replaces the signed-in user's profile fields. */
export const updateMyProfile = (profile) => request('PUT', '/api/profile/me', { body: profile });
