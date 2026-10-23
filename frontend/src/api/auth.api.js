// Exposes authentication API calls using the shared same-origin client.
import { request } from './client.js';

/** Creates an account without starting a session. */
export const registerUser = (details) => request('POST', '/api/auth/register', { body: details });
/** Starts a server-side session. */
export const loginUser = (credentials) => request('POST', '/api/auth/login', { body: credentials });
/** Ends the current server-side session. */
export const logoutUser = () => request('POST', '/api/auth/logout');
/** Returns the current session user. */
export const getCurrentUser = () => request('GET', '/api/auth/me');
