// Executes catalogue and developer-skill SQL with safe Skill response mapping.

function mapSkill(row) {
  return row ? { id: row.id, name: row.name } : null;
}

/**
 * Lists the catalogue in case-insensitive alphabetical order.
 * @param {import('pg').Pool} db Database connection.
 * @returns {Promise<object[]>} Catalogue skill objects.
 * @throws {Error} When the database query fails.
 */
export async function listCatalogue(db) {
  const result = await db.query('SELECT id, name FROM skills ORDER BY lower(name), id');
  return result.rows.map(mapSkill);
}

/**
 * Lists one user's skills in the requested category, alphabetically.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} userId Skill owner.
 * @param {'offered'|'wanted'} skillType Assignment category.
 * @returns {Promise<object[]>} Catalogue skill objects.
 * @throws {Error} When the database query fails.
 */
export async function listForUser(db, userId, skillType) {
  const result = await db.query(
    `SELECT s.id, s.name
     FROM developer_skills ds
     JOIN skills s ON s.id = ds.skill_id
     WHERE ds.user_id = $1 AND ds.skill_type = $2
     ORDER BY lower(s.name), s.id`,
    [userId, skillType]
  );
  return result.rows.map(mapSkill);
}

/**
 * Finds a catalogue skill by id.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} skillId Catalogue identifier.
 * @returns {Promise<object|null>} Skill object or null.
 * @throws {Error} When the database query fails.
 */
export async function findById(db, skillId) {
  const result = await db.query('SELECT id, name FROM skills WHERE id = $1', [skillId]);
  return mapSkill(result.rows[0]);
}

/**
 * Adds a skill to one user's offered or wanted category.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} userId Skill owner.
 * @param {number} skillId Catalogue identifier.
 * @param {'offered'|'wanted'} skillType Assignment category.
 * @returns {Promise<void>} Resolves after insertion.
 * @throws {Error} When a database constraint or query fails.
 */
export async function addForUser(db, userId, skillId, skillType) {
  await db.query(
    'INSERT INTO developer_skills (user_id, skill_id, skill_type) VALUES ($1, $2, $3)',
    [userId, skillId, skillType]
  );
}

/**
 * Removes an assignment and reports whether that exact user/category row existed.
 * @param {import('pg').Pool} db Database connection.
 * @param {number} userId Skill owner.
 * @param {number} skillId Catalogue identifier.
 * @param {'offered'|'wanted'} skillType Assignment category.
 * @returns {Promise<boolean>} True if an assignment was deleted.
 * @throws {Error} When the database query fails.
 */
export async function removeForUser(db, userId, skillId, skillType) {
  const result = await db.query(
    'DELETE FROM developer_skills WHERE user_id = $1 AND skill_id = $2 AND skill_type = $3',
    [userId, skillId, skillType]
  );
  return result.rowCount > 0;
}
