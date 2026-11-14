import { ApiError, request } from './client.js';
let sessionVersion = 0;
let token = null;
export function resetNotificationsSession() { sessionVersion += 1; token = null; }

function sessionCheck(version, userId, responseUserId, signal) {
  signal?.throwIfAborted();
  if (version !== sessionVersion) throw new DOMException('Session changed.', 'AbortError');
  if (userId !== responseUserId) {
    token = null;
    throw new ApiError({ status: 409, code: 'SESSION_CHANGED', message: 'Your account changed in another tab. Reload the application to continue.' });
  }
}
async function read(path, userId, query, signal) {
  const version = sessionVersion;
  const result = await request('GET', path, { query, signal });
  sessionCheck(version, userId, result.meta?.userId, signal);
  return result;
}
async function post(path, body, userId, signal) {
  const version = sessionVersion;
  for (let attempt = 0; attempt < 2; attempt++) {
    sessionCheck(version, userId, userId, signal);
    if (!token || token.userId !== userId) {
      const result = await request('GET', '/api/notifications/csrf-token', { signal });
      sessionCheck(version, userId, result.data.userId, signal);
      token = result.data;
    }
    try {
      const result = await request('POST', path, { body, signal, headers: { 'X-CSRF-Token': token.csrfToken } });
      sessionCheck(version, userId, result.meta?.userId, signal);
      return result;
    } catch (error) {
      sessionCheck(version, userId, userId, signal);
      if (error.code !== 'CSRF_INVALID' || attempt === 1) throw error;
      token = null;
    }
  }
}
export const listNotifications = (userId, cursor, signal) => read('/api/notifications', userId, { limit: 20, cursor }, signal);
export const getUnreadCount = (userId, signal) => read('/api/notifications/unread-count', userId, undefined, signal);
export const markNotificationRead = (userId, item, signal) => post(`/api/notifications/${item.id}/read`, { lastMessageId: item.lastMessageId }, userId, signal);
export const markAllNotificationsRead = (userId, signal) => post('/api/notifications/read-all', {}, userId, signal);
