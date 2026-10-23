// Retrieves public developer profiles and skill assignments without exposing email.

function mapSkill(row) {
  return { id: row.id, name: row.name };
}

/**
 * Lists a page of public profiles and fetches all page skills in one query.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} currentUserId Caller identity to exclude.
 * @param {{search: string, page: number, limit: number}} query Validated list filters.
 * @returns {Promise<{developers: object[], total: number}>} Public profiles and total count.
 * @throws {Error} When a database query fails.
 */
export async function listDevelopers(db, currentUserId, { search, page, limit }) {
  const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
  const pattern = `%${escapedSearch}%`;
  const countResult = await db.query(
    `SELECT count(*)::integer AS total
     FROM users u
     WHERE u.id <> $1 AND ($2 = '' OR u.display_name ILIKE $3 ESCAPE '\\')`,
    [currentUserId, search, pattern]
  );
  const offset = (page - 1) * limit;
  const developersResult = await db.query(
    `SELECT u.id, u.display_name, p.bio, p.experience_level, p.interests,
            p.github_url, p.portfolio_url
     FROM users u
     JOIN developer_profiles p ON p.user_id = u.id
     WHERE u.id <> $1 AND ($2 = '' OR u.display_name ILIKE $3 ESCAPE '\\')
     ORDER BY lower(u.display_name), u.id
     LIMIT $4 OFFSET $5`,
    [currentUserId, search, pattern, limit, offset]
  );
  const developers = developersResult.rows.map(mapDeveloper);
  if (!developers.length) return { developers, total: countResult.rows[0].total };
  const skillsResult = await db.query(
    `SELECT ds.user_id, ds.skill_type, s.id, s.name
     FROM developer_skills ds
     JOIN skills s ON s.id = ds.skill_id
     WHERE ds.user_id = ANY($1::integer[])
     ORDER BY lower(s.name), s.id`,
    [developers.map(({ id }) => id)]
  );
  const byUser = new Map(developers.map((developer) => [developer.id, developer]));
  for (const row of skillsResult.rows) {
    byUser.get(row.user_id)[row.skill_type === 'offered' ? 'offeredSkills' : 'wantedSkills'].push(mapSkill(row));
  }
  return { developers, total: countResult.rows[0].total };
}

/**
 * Finds one public profile, including all its skill assignments.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} userId Profile identifier.
 * @returns {Promise<object|null>} Public profile or null when absent.
 * @throws {Error} When a database query fails.
 */
export async function findDeveloper(db, userId) {
  const result = await db.query(
    `SELECT u.id, u.display_name, p.bio, p.experience_level, p.interests,
            p.github_url, p.portfolio_url
     FROM users u
     JOIN developer_profiles p ON p.user_id = u.id
     WHERE u.id = $1`,
    [userId]
  );
  if (!result.rows[0]) return null;
  const developer = mapDeveloper(result.rows[0], true);
  const skillsResult = await db.query(
    `SELECT ds.skill_type, s.id, s.name
     FROM developer_skills ds
     JOIN skills s ON s.id = ds.skill_id
     WHERE ds.user_id = $1
     ORDER BY lower(s.name), s.id`,
    [userId]
  );
  for (const row of skillsResult.rows) {
    developer[row.skill_type === 'offered' ? 'offeredSkills' : 'wantedSkills'].push(mapSkill(row));
  }
  return developer;
}

/**
 * Loads live connection summaries for multiple developer ids in one query.
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
    const outgoing = row.sender_id === currentUserId;
    const otherId = outgoing ? row.recipient_id : row.sender_id;
    return [otherId, { requestId: row.id, status: row.status, direction: outgoing ? 'outgoing' : 'incoming' }];
  }));
}

function mapDeveloper(row, detailed = false) {
  const developer = {
    id: row.id,
    displayName: row.display_name,
    bio: row.bio,
    experienceLevel: row.experience_level,
    offeredSkills: [],
    wantedSkills: []
  };
  if (detailed) {
    developer.interests = row.interests;
    developer.githubUrl = row.github_url;
    developer.portfolioUrl = row.portfolio_url;
  }
  return developer;
}
