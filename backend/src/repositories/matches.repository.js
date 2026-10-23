// Fetches candidate skills and live collaboration state for match scoring.

/**
 * Loads all developers and their skill lists in one grouped query.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} currentUserId Caller identity.
 * @returns {Promise<{currentUser: object|null, candidates: object[]}>} Matching inputs.
 * @throws {Error} When the database query fails.
 */
export async function loadCandidates(db, currentUserId) {
  const result = await db.query(
    `SELECT u.id, u.display_name, p.bio, p.experience_level,
            ds.skill_type, s.id AS skill_id, s.name AS skill_name
     FROM users u
     JOIN developer_profiles p ON p.user_id = u.id
     LEFT JOIN developer_skills ds ON ds.user_id = u.id
     LEFT JOIN skills s ON s.id = ds.skill_id
     ORDER BY u.id, lower(s.name), s.id`,
    []
  );
  const byId = new Map();
  for (const row of result.rows) {
    if (!byId.has(row.id)) {
      byId.set(row.id, {
        id: row.id,
        displayName: row.display_name,
        bio: row.bio,
        experienceLevel: row.experience_level,
        offered: [],
        wanted: []
      });
    }
    if (row.skill_type) byId.get(row.id)[row.skill_type].push({ id: row.skill_id, name: row.skill_name });
  }
  const currentUser = byId.get(currentUserId);
  if (!currentUser) return { currentUser: null, candidates: [] };
  return {
    currentUser,
    candidates: [...byId.values()].filter((developer) => developer.id !== currentUserId)
  };
}

/**
 * Retrieves live pending or accepted connections for returned developer ids.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} currentUserId Caller identity.
 * @param {number[]} developerIds Candidate identifiers.
 * @returns {Promise<Map<number, object>>} Connection summaries keyed by developer id.
 * @throws {Error} When the database query fails.
 */
export async function loadConnections(db, currentUserId, developerIds) {
  if (!developerIds.length) return new Map();
  const result = await db.query(
    `SELECT id, sender_id, recipient_id, status
     FROM collaboration_requests
     WHERE status IN ('pending', 'accepted')
       AND ((sender_id = $1 AND recipient_id = ANY($2::integer[]))
         OR (recipient_id = $1 AND sender_id = ANY($2::integer[])))`,
    [currentUserId, developerIds]
  );
  return new Map(result.rows.map((row) => {
    const direction = row.sender_id === currentUserId ? 'outgoing' : 'incoming';
    const otherId = direction === 'outgoing' ? row.recipient_id : row.sender_id;
    return [otherId, { requestId: row.id, status: row.status, direction }];
  }));
}
