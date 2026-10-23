// Defines safe, expected application errors consumed by the HTTP error handler.

/** Represents an expected API failure with a status, code, and optional validation details. */
export default class AppError extends Error {
  /**
   * Creates an API error.
   * @param {number} status HTTP status code.
   * @param {string} code Stable application error code.
   * @param {string} message Client-safe message.
   * @param {Record<string, string>} [details] Validation errors by field.
   * @throws {TypeError} When required error attributes are invalid.
   */
  constructor(status, code, message, details) {
    super(message);
    if (!Number.isInteger(status) || typeof code !== 'string' || typeof message !== 'string') {
      throw new TypeError('AppError requires a status, code, and message');
    }
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
