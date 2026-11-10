import { ApiError, request } from './client.js';

let sessionVersion = 0;
let token = null;

// Tokens and message content stay in memory, never in browser storage.
export function resetMessagingSession() {
  sessionVersion += 1;
  token = null;
}

async function protectedPost(path, body, userId, signal) {
  const version = sessionVersion;
  function assertSession() {
    signal?.throwIfAborted();
    if (version !== sessionVersion) throw new DOMException('Session changed.', 'AbortError');
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    assertSession();
    if (!token || token.userId !== userId) {
      const result = await request('GET', '/api/conversations/csrf-token', { signal });
      assertSession();
      if (result.data.userId !== userId) {
        throw new ApiError({ code: 'SESSION_CHANGED', message: 'Your account changed in another tab. Reload this page before messaging.' });
      }
      token = result.data;
    }
    try {
      const result = await request('POST', path, { body, signal, headers: { 'X-CSRF-Token': token.csrfToken } });
      assertSession();
      return result;
    } catch (error) {
      assertSession();
      if (error.code !== 'CSRF_INVALID' || attempt === 1) throw error;
      token = null;
    }
  }
}

export const listConversations = (page = 1, signal) => request('GET', '/api/conversations', { query: { page, limit: 20 }, signal });
export const getConversation = (id, signal) => request('GET', `/api/conversations/${id}`, { signal });
export const listMessages = (id, query = {}, signal) => request('GET', `/api/conversations/${id}/messages`, { query: { limit: 30, ...query }, signal });
export const openConversation = (requestId, userId, signal) => protectedPost('/api/conversations', { requestId }, userId, signal);
export const sendMessage = (id, fields, userId, signal) => protectedPost(`/api/conversations/${id}/messages`, fields, userId, signal);
