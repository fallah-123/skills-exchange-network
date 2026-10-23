// Forwards asynchronous route failures to Express's central error middleware.

/**
 * Wraps an asynchronous Express handler so rejected promises reach error handling.
 * @param {Function} handler Express route handler.
 * @returns {Function} Express-compatible wrapped handler.
 * @throws {Error} Forwards asynchronous handler failures to Express.
 */
export default function asyncHandler(handler) {
  return function wrappedHandler(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}
