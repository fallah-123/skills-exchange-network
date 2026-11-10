// All database reads are scoped to the authenticated participant before mapping.
const conversationColumns = `c.id, c.collaboration_request_id, c.created_at,
  other.id AS counterpart_id, other.display_name AS counterpart_name,
  latest.id AS message_id, latest.sender_id AS message_sender_id,
  latest.client_message_id AS message_client_id, latest.body AS message_body,
  latest.created_at AS message_created_at`;
const conversationJoins = `FROM public.conversations c
  JOIN public.collaboration_requests r ON r.id = c.collaboration_request_id
  JOIN public.users other ON other.id = CASE WHEN r.sender_id = $1 THEN r.recipient_id ELSE r.sender_id END
  LEFT JOIN LATERAL (
    SELECT id, sender_id, client_message_id, body, created_at FROM public.messages
    WHERE conversation_id = c.id ORDER BY id DESC LIMIT 1
  ) latest ON true`;
const participantFilter = `r.status = 'accepted' AND (r.sender_id = $1 OR r.recipient_id = $1)`;

export function mapMessage(row) {
  return {
    id: row.id, conversationId: row.conversation_id, senderId: row.sender_id,
    clientMessageId: row.client_message_id, body: row.body, createdAt: row.created_at.toISOString()
  };
}

function mapConversation(row) {
  if (!row) return null;
  return {
    id: row.id, requestId: row.collaboration_request_id, createdAt: row.created_at.toISOString(),
    counterpart: { id: row.counterpart_id, displayName: row.counterpart_name },
    lastMessage: row.message_id ? mapMessage({
      id: row.message_id, conversation_id: row.id, sender_id: row.message_sender_id,
      client_message_id: row.message_client_id, body: row.message_body, created_at: row.message_created_at
    }) : null
  };
}

export async function findConnection(db, userId, requestId) {
  const result = await db.query(`SELECT id, status FROM public.collaboration_requests
    WHERE id = $2 AND (sender_id = $1 OR recipient_id = $1) FOR KEY SHARE`, [userId, requestId]);
  return result.rows[0] ?? null;
}

export async function openConversation(db, requestId) {
  const inserted = await db.query(`INSERT INTO public.conversations (collaboration_request_id)
    VALUES ($1) ON CONFLICT (collaboration_request_id) DO NOTHING RETURNING id`, [requestId]);
  if (inserted.rowCount) return { id: inserted.rows[0].id, created: true };
  // A separate statement sees a concurrent creator's committed row at READ COMMITTED.
  const existing = await db.query('SELECT id FROM public.conversations WHERE collaboration_request_id = $1', [requestId]);
  return { id: existing.rows[0].id, created: false };
}

export async function findConversation(db, userId, id, lock = false) {
  const result = await db.query(`SELECT ${conversationColumns} ${conversationJoins}
    WHERE ${participantFilter} AND c.id = $2 ${lock ? 'FOR UPDATE OF c' : ''}`, [userId, id]);
  return mapConversation(result.rows[0]);
}

export async function listConversations(db, userId, { page, limit }) {
  const result = await db.query(`SELECT ${conversationColumns} ${conversationJoins}
    WHERE ${participantFilter}
    ORDER BY COALESCE(latest.created_at, c.created_at) DESC, c.id DESC
    LIMIT $2 OFFSET $3`, [userId, limit + 1, (page - 1) * limit]);
  return { data: result.rows.slice(0, limit).map(mapConversation), hasMore: result.rows.length > limit };
}

export async function listMessages(db, conversationId, { before, after, limit }) {
  const incremental = after !== undefined;
  const cursor = incremental ? after : before;
  const result = await db.query(`SELECT id, conversation_id, sender_id, client_message_id, body, created_at
    FROM public.messages WHERE conversation_id = $1
    ${cursor === undefined ? '' : `AND id ${incremental ? '>' : '<'} $3::bigint`}
    ORDER BY id ${incremental ? 'ASC' : 'DESC'} LIMIT $2`,
  cursor === undefined ? [conversationId, limit + 1] : [conversationId, limit + 1, cursor]);
  const rows = result.rows.slice(0, limit);
  if (!incremental) rows.reverse();
  return { data: rows.map(mapMessage), hasMore: result.rows.length > limit };
}

export async function findRetry(db, conversationId, senderId, clientMessageId) {
  const result = await db.query(`SELECT * FROM public.messages
    WHERE conversation_id = $1 AND sender_id = $2 AND client_message_id = $3`, [conversationId, senderId, clientMessageId]);
  return result.rows[0] ? mapMessage(result.rows[0]) : null;
}

export async function lockSender(db, userId) {
  // Shared across backend instances and sessions. No in-memory limits to reset.
  await db.query('SELECT pg_advisory_xact_lock($1, $2)', [1297303373, userId]);
}

export async function recentSends(db, userId, windowMs, limit) {
  const result = await db.query(`SELECT created_at, statement_timestamp() AS checked_at
    FROM public.messages WHERE sender_id = $1
      AND created_at > statement_timestamp() - ($2::integer * interval '1 millisecond')
    ORDER BY created_at DESC LIMIT $3`, [userId, windowMs, limit]);
  return result.rows;
}

export async function insertMessage(db, conversationId, senderId, { body, clientMessageId }) {
  const result = await db.query(`INSERT INTO public.messages
    (conversation_id, sender_id, client_message_id, body, created_at)
    VALUES ($1, $2, $3, $4, clock_timestamp()) RETURNING *`, [conversationId, senderId, clientMessageId, body]);
  return mapMessage(result.rows[0]);
}
