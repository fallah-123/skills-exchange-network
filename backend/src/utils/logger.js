// Small structured logger for backend errors and operational messages.

/**
 * Logs an operational message without request or credential data.
 * @param {string} message Safe operational message.
 * @returns {void} No return value.
 * @throws {Error} When the output stream rejects the log operation.
 */
export function info(message) {
  console.info(JSON.stringify({ level: 'info', message, timestamp: new Date().toISOString() }));
}

/**
 * Logs an error object for server-side diagnosis without returning it to clients.
 * @param {Error} loggedError Error to record.
 * @returns {void} No return value.
 * @throws {Error} When the output stream rejects the log operation.
 */
export function error(loggedError) {
  console.error(JSON.stringify({
    level: 'error',
    message: loggedError.message,
    stack: loggedError.stack,
    timestamp: new Date().toISOString()
  }));
}
