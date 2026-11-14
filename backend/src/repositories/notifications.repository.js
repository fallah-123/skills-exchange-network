// Only trusted business services create notifications; reads/writes always scope ownership.
export async function recordMessage(db, recipientId, message) {
  await db.query(`INSERT INTO public.notifications
    (recipient_id, actor_id, type, conversation_id, last_message_id)
    VALUES ($1, $2, 'message', $3, $4)
    ON CONFLICT (recipient_id, conversation_id) WHERE type = 'message' AND read_at IS NULL
    DO UPDATE SET last_message_id = EXCLUDED.last_message_id,
      event_count = notifications.event_count + 1, last_event_at = clock_timestamp()`,
  [recipientId, message.senderId, message.conversationId, message.id]);
}

export async function recordRequest(db, recipientId, actorId, requestId, type) {
  await db.query(`INSERT INTO public.notifications (recipient_id, actor_id, collaboration_request_id, type)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (recipient_id, collaboration_request_id, type) WHERE type <> 'message' DO NOTHING`,
  [recipientId, actorId, requestId, type]);
}

function map(row) {
  return {
    id: row.id, type: row.type, actor: { id: row.actor_id, displayName: row.display_name },
    requestId: row.collaboration_request_id, conversationId: row.conversation_id,
    lastMessageId: row.last_message_id, eventCount: row.event_count,
    createdAt: row.created_at.toISOString(), lastEventAt: row.last_event_at.toISOString(),
    readAt: row.read_at?.toISOString() ?? null,
  };
}

export async function list(db, userId, { limit, cursor, unread }) {
  const result = await db.query(`SELECT n.*, u.display_name,
      to_char(n.last_event_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
    FROM public.notifications n JOIN public.users u ON u.id = n.actor_id
    WHERE n.recipient_id = $1 AND (NOT $2::boolean OR n.read_at IS NULL)
      AND ($3::timestamptz IS NULL OR (n.last_event_at, n.id) < ($3::timestamptz, $4::bigint))
    ORDER BY n.last_event_at DESC, n.id DESC LIMIT $5`,
  [userId, unread, cursor?.at ?? null, cursor?.id ?? null, limit + 1]);
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  const hasMore = result.rows.length > limit;
  // Keep PostgreSQL microsecond precision in cursors; JS Date truncates it.
  const nextCursor = hasMore ? Buffer.from(JSON.stringify({ at: last.cursor_time, id: last.id })).toString('base64url') : null;
  return { data: rows.map(map), meta: { hasMore, nextCursor, limit } };
}

export async function countUnread(db, userId) {
  return (await db.query('SELECT count(*)::integer AS count FROM public.notifications WHERE recipient_id = $1 AND read_at IS NULL', [userId])).rows[0].count;
}

export async function acknowledge(db, userId, id, lastMessageId) {
  // PostgreSQL rechecks this predicate after a concurrent updater commits.
  const result = await db.query(`UPDATE public.notifications SET read_at = COALESCE(read_at, clock_timestamp())
    WHERE recipient_id = $1 AND id = $2 AND (read_at IS NOT NULL OR last_message_id IS NOT DISTINCT FROM $3::bigint)
    RETURNING id`, [userId, id, lastMessageId]);
  if (result.rowCount) return 'read';
  const existing = await db.query('SELECT id FROM public.notifications WHERE recipient_id = $1 AND id = $2', [userId, id]);
  return existing.rowCount ? 'changed' : 'missing';
}

export async function acknowledgeAll(db, userId) {
  // MATERIALIZED captures versions at the statement snapshot. Concurrent new rows
  // are absent; updated groups fail the version predicate after any lock wait.
  const result = await db.query(`WITH snapshot AS MATERIALIZED (
      SELECT id, last_message_id FROM public.notifications WHERE recipient_id = $1 AND read_at IS NULL
    ) UPDATE public.notifications n SET read_at = clock_timestamp() FROM snapshot s
    WHERE n.id = s.id AND n.recipient_id = $1 AND n.read_at IS NULL
      AND n.last_message_id IS NOT DISTINCT FROM s.last_message_id RETURNING n.id`, [userId]);
  return result.rowCount;
}
