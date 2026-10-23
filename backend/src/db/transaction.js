// Provides an atomic transaction helper for multi-statement service operations.

/**
 * Runs a callback in a transaction and rolls back before rethrowing failures.
 * @param {import('pg').Pool} pool PostgreSQL connection pool.
 * @param {(client: import('pg').PoolClient) => Promise<unknown>} callback Transaction work.
 * @returns {Promise<unknown>} The callback result.
 * @throws {Error} The callback or transaction error.
 */
export async function withTransaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (transactionError) {
    await client.query('ROLLBACK');
    throw transactionError;
  } finally {
    client.release();
  }
}
