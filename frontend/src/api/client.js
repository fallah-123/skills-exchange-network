// Provides the shared fetch client and normalized API errors for the frontend.
const NETWORK_ERROR_MESSAGE =
  'Cannot reach the server. Check your connection and try again.';
let unauthenticatedHandler = () => {};

// Proxies may return an HTML/text 429 rather than the application's JSON envelope.
// Retry-After allows either a number of seconds or an HTTP date.
function retryAfterSeconds(value) {
  if (!value?.trim()) return 0;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds));
  const deadline = Date.parse(value);
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - Date.now()) / 1000)) : 0;
}

export class ApiError extends Error {
  constructor({
    status = 0,
    code = 'UNKNOWN_ERROR',
    message = 'Something went wrong.',
    details = {},
    retryAfter = 0,
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = retryAfter;
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
export async function request(method, path, { body, query, signal, headers } = {}) {
  // An empty base uses same-origin requests, proxied by Vite locally and Vercel in production.
  const apiBaseUrl = import.meta.env?.VITE_API_URL || '';

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
      headers: { 'Content-Type': 'application/json', ...headers },
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
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    payload = null;
  }
  if (!response.ok) {
    const apiError = payload?.error;
    const retryAfter = retryAfterSeconds(response.headers.get('Retry-After'));
    const rateLimited = response.status === 429;
    const fallbackMessage = rateLimited
      ? `Too many requests. ${retryAfter > 0 ? `Please wait ${retryAfter} seconds before trying again.` : 'Please wait a little before trying again.'}`
      : 'The server returned an unexpected response.';
    const error = new ApiError({
      status: response.status,
      code: apiError?.code || (rateLimited ? 'RATE_LIMITED' : 'INVALID_RESPONSE'),
      message:
        apiError?.message || fallbackMessage,
      details: apiError?.details || {},
      retryAfter,
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
