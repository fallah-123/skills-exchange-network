// Enforces collaboration request creation, visibility, and state transitions.
import AppError from '../utils/AppError.js';
import { REQUEST_STATUS } from '../constants.js';
import * as users from '../repositories/users.repository.js';
import * as requests from '../repositories/requests.repository.js';

/**
 * Creates a request after preventing self-targeting and checking recipient existence.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} senderId Authenticated sender.
 * @param {number} recipientId Request recipient.
 * @param {string|null} message Optional request message.
 * @returns {Promise<object>} Created request view.
 * @throws {AppError} When self-targeting or recipient is missing.
 */
export async function create(pool, senderId, recipientId, message) {
  if (recipientId === senderId) throw new AppError(400, 'SELF_REQUEST', 'You cannot send a request to yourself.');
  const recipient = await users.findPublicById(pool, recipientId);
  if (!recipient) throw new AppError(404, 'USER_NOT_FOUND', 'The user was not found.');
  return requests.create(pool, senderId, recipientId, message);
}

/**
 * Lists requests involving the caller in the selected direction and optional status.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Authenticated participant.
 * @param {'incoming'|'outgoing'} direction List direction.
 * @param {string|undefined} status Optional status filter.
 * @returns {Promise<object[]>} Request views.
 * @throws {Error} When a database query fails.
 */
export async function list(pool, userId, direction, status) {
  return requests.listForUser(pool, userId, direction, status);
}

/**
 * Accepts or rejects a pending request with a single conditional update.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} requestId Request identifier.
 * @param {number} userId Authenticated recipient.
 * @param {string} status Final request state.
 * @returns {Promise<object>} Updated request view.
 * @throws {AppError} When caller visibility, authorization, or state rules fail.
 */
export async function respond(pool, requestId, userId, status) {
  const updated = await requests.updatePending(pool, requestId, userId, status);
  if (updated) return requests.getRequestView(pool, updated, userId);
  const existing = await requests.findForParticipant(pool, requestId, userId);
  if (!existing) throw new AppError(404, 'REQUEST_NOT_FOUND', 'The request was not found.');
  if (existing.sender_id === userId) {
    throw new AppError(403, 'FORBIDDEN', 'Only the recipient can respond to a request.');
  }
  throw new AppError(409, 'INVALID_STATE', 'This request has already been accepted or rejected.');
}

/**
 * Returns the live connection between two users.
 * @param {import('pg').Pool} pool Database pool.
 * @param {number} userId Caller identity.
 * @param {number} developerId Other participant.
 * @returns {Promise<object|null>} Connection summary or null.
 * @throws {Error} When the database query fails.
 */
export async function connectionForPair(pool, userId, developerId) {
  const result = await pool.query(
    `SELECT id, sender_id, recipient_id, status
     FROM collaboration_requests
     WHERE status IN ('pending', 'accepted')
       AND ((sender_id = $1 AND recipient_id = $2) OR (sender_id = $2 AND recipient_id = $1))`,
    [userId, developerId]
  );
  const row = result.rows[0];
  if (!row) return null;
  return {
    requestId: row.id,
    status: row.status,
    direction: row.sender_id === userId ? 'outgoing' : 'incoming'
  };
}

export { REQUEST_STATUS };
