// Reads and updates developer profile data with explicit safe field mapping.

function mapProfile(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    displayName: row.display_name,
    email: row.email,
    bio: row.bio,
    experienceLevel: row.experience_level,
    interests: row.interests,
    githubUrl: row.github_url,
    portfolioUrl: row.portfolio_url,
    isComplete: row.bio !== null && row.experience_level !== null,
    createdAt: row.profile_created_at.toISOString(),
    updatedAt: row.profile_updated_at.toISOString()
  };
}

/**
 * Retrieves a user's profile joined with their public account fields.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} userId Profile owner.
 * @returns {Promise<object|null>} Safe profile object or null.
 * @throws {Error} When the database query fails.
 */
export async function findByUserId(db, userId) {
  const result = await db.query(
    `SELECT u.id AS user_id, u.display_name, u.email, p.bio, p.experience_level,
            p.interests, p.github_url, p.portfolio_url,
            p.created_at AS profile_created_at, p.updated_at AS profile_updated_at
     FROM developer_profiles p
     JOIN users u ON u.id = p.user_id
     WHERE p.user_id = $1`,
    [userId]
  );
  return mapProfile(result.rows[0]);
}

/**
 * Replaces user display name and profile fields atomically.
 * @param {import('pg').PoolClient} db Transaction connection.
 * @param {number} userId Profile owner.
 * @param {object} fields Validated profile values.
 * @returns {Promise<void>} Resolves after both records are updated.
 * @throws {Error} When a database write fails.
 */
export async function updateProfile(db, userId, fields) {
  await db.query('UPDATE users SET display_name = $1 WHERE id = $2', [fields.displayName, userId]);
  await db.query(
    `INSERT INTO developer_profiles
       (user_id, bio, experience_level, interests, github_url, portfolio_url)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (user_id) DO UPDATE SET
       bio = EXCLUDED.bio,
       experience_level = EXCLUDED.experience_level,
       interests = EXCLUDED.interests,
       github_url = EXCLUDED.github_url,
       portfolio_url = EXCLUDED.portfolio_url`,
    [userId, fields.bio, fields.experienceLevel, fields.interests, fields.githubUrl, fields.portfolioUrl]
  );
}
