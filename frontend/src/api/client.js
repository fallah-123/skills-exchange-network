// Provides the shared fetch client and normalized API errors for the frontend.
const NETWORK_ERROR_MESSAGE =
  'Cannot reach the server. Check your connection and try again.';
let unauthenticatedHandler = () => {};

export class ApiError extends Error {
  constructor({
    status = 0,
    code = 'UNKNOWN_ERROR',
    message = 'Something went wrong.',
    details = {},
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/**
 * Sets the callback for expired sessions returned by protected API calls.
 * @param {(error: ApiError) => void} handler Callback invoked for unauthenticated responses.
 */
export function setUnauthenticatedHandler(handler) {
  unauthenticatedHandler = typeof handler === 'function' ? handler : () => {};
}

/**
 * Sends a JSON request and returns the standard API response envelope.
 * @param {string} method HTTP method.
 * @param {string} path API path beginning with /api.
 * @param {{body?: object, query?: object, signal?: AbortSignal}} options Request options.
 * @returns {Promise<{data?: *, message?: string, meta?: object}>} Parsed response.
 */
export async function request(method, path, { body, query, signal } = {}) {
  // An empty base uses same-origin requests, proxied by Vite locally and Vercel in production.
  const apiBaseUrl = import.meta.env.VITE_API_URL || '';

  const url = new URL(path, 'http://localhost');
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '')
      url.searchParams.set(key, String(value));
  }

  let response;
  try {
    const targetUrl = `${apiBaseUrl}${url.pathname}${url.search}`;

    response = await fetch(targetUrl, {
      method,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      ...(signal ? { signal } : {}),
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: NETWORK_ERROR_MESSAGE,
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const apiError = payload?.error;
    const error = new ApiError({
      status: response.status,
      code: apiError?.code || 'INVALID_RESPONSE',
      message:
        apiError?.message || 'The server returned an unexpected response.',
      details: apiError?.details || {},
    });
    if (
      response.status === 401 &&
      error.code === 'UNAUTHENTICATED' &&
      path !== '/api/auth/me'
    ) {
      unauthenticatedHandler(error);
    }
    throw error;
  }
  if (!payload || typeof payload !== 'object') {
    throw new ApiError({
      status: response.status,
      code: 'INVALID_RESPONSE',
      message: 'The server returned an unexpected response.',
    });
  }
  return { data: payload.data, message: payload.message, meta: payload.meta };
}
