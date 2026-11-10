import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';

const PostgreSqlSessionStore = connectPgSimple(session);

export function createSessionStore(pool) {
  const store = new PostgreSqlSessionStore({ pool, tableName: 'user_sessions', createTableIfMissing: false });
  const insertOrSave = store.set.bind(store);
  store.set = (sid, data, callback) => {
    if (!data.cookiePolicyRevision) return insertOrSave(sid, data, callback);
    // Upgrades only apply to already-persisted sessions. An upsert here could
    // resurrect a session deleted by a concurrent logout while the request ran.
    const expires = Math.ceil(new Date(data.cookie.expires).getTime() / 1000);
    pool.query(`UPDATE public.user_sessions SET sess = $1, expire = to_timestamp($2)
      WHERE sid = $3 AND expire >= CURRENT_TIMESTAMP`, [JSON.stringify(data), expires, sid])
      .then(() => callback?.(null), error => callback?.(error));
  };
  return store;
}
