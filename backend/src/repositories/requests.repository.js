// Runs collaboration-request SQL and maps rows to direction-aware API data.

/**
 * Inserts a request and returns its outgoing API representation.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} senderId Request sender.
 * @param {number} recipientId Request recipient.
 * @param {string|null} message Optional request message.
 * @returns {Promise<object>} Public request representation.
 * @throws {Error} When a database constraint or query fails.
 */
export async function create(db, senderId, recipientId, message) {
  const result = await db.query(
    `INSERT INTO collaboration_requests (sender_id, recipient_id, message)
     VALUES ($1, $2, $3)
     RETURNING id, sender_id, recipient_id, message, status, created_at, updated_at`,
    [senderId, recipientId, message]
  );
  return getRequestView(db, result.rows[0], senderId);
}

/**
 * Lists a user's incoming or outgoing requests with counterpart names.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} userId Request participant.
 * @param {'incoming'|'outgoing'} direction Requested list direction.
 * @param {string|undefined} status Optional request status filter.
 * @returns {Promise<object[]>} Safe request representations.
 * @throws {Error} When the database query fails.
 */
export async function listForUser(db, userId, direction, status) {
  const participantColumn = direction === 'incoming' ? 'recipient_id' : 'sender_id';
  const counterpartJoin = direction === 'incoming' ? 'sender_id' : 'recipient_id';
  const result = await db.query(
    `SELECT r.id, r.sender_id, r.recipient_id, r.message, r.status, r.created_at, r.updated_at,
            other.id AS counterpart_id, other.display_name AS counterpart_name
     FROM collaboration_requests r
     JOIN users other ON other.id = r.${counterpartJoin}
     WHERE r.${participantColumn} = $1 AND ($2::text IS NULL OR r.status = $2)
     ORDER BY r.created_at DESC, r.id DESC`,
    [userId, status ?? null]
  );
  return result.rows.map((row) => mapRequest(row, direction, row.counterpart_id, row.counterpart_name));
}

/**
 * Atomically changes a pending request and returns its database row.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} requestId Request identifier.
 * @param {number} recipientId Authenticated recipient.
 * @param {string} status Accepted or rejected state.
 * @returns {Promise<object|null>} Updated row or null when not eligible.
 * @throws {Error} When the database query fails.
 */
export async function updatePending(db, requestId, recipientId, status) {
  const result = await db.query(
    `UPDATE collaboration_requests
     SET status = $1
     WHERE id = $2 AND recipient_id = $3 AND status = 'pending'
     RETURNING id, sender_id, recipient_id, message, status, created_at, updated_at`,
    [status, requestId, recipientId]
  );
  return result.rows[0] ?? null;
}

/**
 * Finds a request only when the caller is one of its participants.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} requestId Request identifier.
 * @param {number} userId Caller identity.
 * @returns {Promise<object|null>} Participant request row or null.
 * @throws {Error} When the database query fails.
 */
export async function findForParticipant(db, requestId, userId) {
  const result = await db.query(
    `SELECT id, sender_id, recipient_id, message, status, created_at, updated_at
     FROM collaboration_requests
     WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)`,
    [requestId, userId]
  );
  return result.rows[0] ?? null;
}

/**
 * Retrieves the API view of one request row and joins its counterpart.
 * @param {import('pg').Pool} db Database connection.
 * @param {object} row Request database row.
 * @param {number} viewerId Authenticated viewer.
 * @returns {Promise<object>} Direction-aware request object.
 * @throws {Error} When the database query fails.
 */
export async function getRequestView(db, row, viewerId) {
  const outgoing = row.sender_id === viewerId;
  const counterpartId = outgoing ? row.recipient_id : row.sender_id;
  const result = await db.query(
    'SELECT id, display_name FROM users WHERE id = $1',
    [counterpartId]
  );
  return mapRequest(row, outgoing ? 'outgoing' : 'incoming', result.rows[0].id, result.rows[0].display_name);
}

function mapRequest(row, direction, counterpartId, counterpartName) {
  return {
    id: row.id,
    status: row.status,
    message: row.message,
    direction,
    counterpart: { id: counterpartId, displayName: counterpartName },
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString()
  };
}
