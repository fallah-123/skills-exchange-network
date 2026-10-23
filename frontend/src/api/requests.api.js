// Exposes collaboration request API calls.
import { request } from './client.js';

/** Creates an outgoing collaboration request. */
export const createRequest = (recipientId, message) => request('POST', '/api/requests', { body: { recipientId, message } });
/** Lists incoming or outgoing requests with an optional status filter. */
export const listRequests = (direction, status, signal) => request('GET', `/api/requests/${encodeURIComponent(direction)}`, { query: { status }, signal });
/** Accepts or rejects a collaboration request. */
export const respondToRequest = (id, action) => request('POST', `/api/requests/${encodeURIComponent(id)}/${encodeURIComponent(action)}`);
