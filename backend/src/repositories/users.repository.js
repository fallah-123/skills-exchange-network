// Runs user-account SQL and maps database rows to safe API user objects.

function mapUser(row) {
  if (!row) return null;
  return { id: row.id, displayName: row.display_name, email: row.email };
}

/**
 * Finds an account by normalized email, including its hash for authentication only.
 * @param {import('pg').Pool} db Database connection.
 * @param {string} email Email lookup key.
 * @returns {Promise<object|null>} Internal authentication row or null.
 * @throws {Error} When the database query fails.
 */
export async function findByEmail(db, email) {
  const result = await db.query(
    'SELECT id, display_name, email, password_hash FROM users WHERE email = $1',
    [email.trim().toLowerCase()]
  );
  return result.rows[0] ?? null;
}

/**
 * Finds a user by id without returning password data.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} id User identifier.
 * @returns {Promise<object|null>} Public user or null.
 * @throws {Error} When the database query fails.
 */
export async function findPublicById(db, id) {
  const result = await db.query(
    'SELECT id, display_name, email FROM users WHERE id = $1',
    [id]
  );
  return mapUser(result.rows[0]);
}

/**
 * Inserts a normalized account and returns its public fields.
 * @param {import('pg').PoolClient} db Transaction connection.
 * @param {{displayName: string, email: string, passwordHash: string}} fields Normalized account data.
 * @returns {Promise<object>} Public user fields.
 * @throws {Error} When the insert violates a database constraint.
 */
export async function insertUser(db, { displayName, email, passwordHash }) {
  const result = await db.query(
    `INSERT INTO users (display_name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING id, display_name, email`,
    [displayName, email, passwordHash]
  );
  return mapUser(result.rows[0]);
}

/**
 * Updates an account display name without changing trigger-managed timestamps.
 * @param {import('pg').PoolClient} db Transaction connection.
 * @param {number} userId Account identifier.
 * @param {string} displayName Validated display name.
 * @returns {Promise<void>} Resolves after update.
 * @throws {Error} When the database update fails.
 */
export async function updateDisplayName(db, userId, displayName) {
  await db.query('UPDATE users SET display_name = $1 WHERE id = $2', [displayName, userId]);
}
