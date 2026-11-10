const baseTables = ['users', 'developer_profiles', 'skills', 'developer_skills', 'collaboration_requests', 'user_sessions'];
const baseTriggers = ['users_set_updated_at', 'developer_profiles_set_updated_at', 'collaboration_requests_guard_trg', 'collaboration_requests_set_updated_at'];
const chatTables = ['conversations', 'messages'];
const chatTriggers = ['conversations_guard_trg', 'messages_guard_trg'];

// Read-only deployment checks, also run inside the migration transaction before commit.
export async function checkDatabaseReadiness(db, { messaging = true } = {}) {
  const errors = [];
  const expectedTables = [...baseTables, ...(messaging ? chatTables : [])];
  const tables = await db.query(`SELECT c.relname, c.relrowsecurity FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[])`, [expectedTables]);
  for (const name of expectedTables) {
    if (!tables.rows.some(row => row.relname === name)) errors.push(`Missing table: ${name}`);
  }
  const expectedTriggers = [...baseTriggers, ...(messaging ? chatTriggers : [])];
  const triggers = await db.query(`SELECT t.tgname FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
      AND t.tgname = ANY($1::text[])`, [expectedTriggers]);
  for (const name of expectedTriggers) {
    if (!triggers.rows.some(row => row.tgname === name)) errors.push(`Missing or disabled trigger: ${name}`);
  }
  if (!messaging || chatTables.some(name => !tables.rows.some(row => row.relname === name))) return errors;
  for (const name of chatTables) {
    if (!tables.rows.find(row => row.relname === name).relrowsecurity) errors.push(`RLS disabled: ${name}`);
  }
  const policies = await db.query("SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = ANY($1::text[])", [chatTables]);
  if (policies.rowCount) errors.push('Messaging tables must have no Data API policies.');
  const indexes = await db.query(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid IN ('public.messages'::regclass, 'public.conversations'::regclass) AND i.indisvalid`);
  for (const name of ['conversations_request_key', 'messages_client_message_key', 'messages_conversation_history_idx', 'messages_sender_idx']) {
    if (!indexes.rows.some(row => row.relname === name)) errors.push(`Missing or invalid index: ${name}`);
  }
  const exposedObjects = await db.query(`SELECT c.relname FROM pg_class c,
    LATERAL aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))) a
    WHERE c.oid IN ('public.conversations'::regclass, 'public.messages'::regclass,
      pg_get_serial_sequence('public.conversations', 'id')::regclass, pg_get_serial_sequence('public.messages', 'id')::regclass)
      AND a.grantee = 0`);
  if (exposedObjects.rowCount) errors.push('PUBLIC has messaging table or sequence privileges.');
  const functions = await db.query(`SELECT p.proname, p.prosecdef, p.proconfig,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AS public_access
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN ('messaging_guard_conversation', 'messaging_guard_message') AND p.pronargs = 0`);
  if (functions.rowCount !== 2 || functions.rows.some(row => row.prosecdef || row.public_access || !row.proconfig?.includes('search_path=pg_catalog'))) {
    errors.push('Messaging guard functions are missing or have unsafe permissions/search paths.');
  }
  if (functions.rowCount === 2) {
    const grants = await db.query(`SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated', 'service_role') AND (
      has_table_privilege(oid, 'public.conversations', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
      has_table_privilege(oid, 'public.messages', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
      has_sequence_privilege(oid, pg_get_serial_sequence('public.conversations', 'id'), 'USAGE,SELECT,UPDATE') OR
      has_sequence_privilege(oid, pg_get_serial_sequence('public.messages', 'id'), 'USAGE,SELECT,UPDATE') OR
      has_function_privilege(oid, 'public.messaging_guard_conversation()', 'EXECUTE') OR
      has_function_privilege(oid, 'public.messaging_guard_message()', 'EXECUTE'))`);
    if (grants.rowCount) errors.push(`Messaging privileges exposed to: ${grants.rows.map(row => row.rolname).join(', ')}`);
  }
  return errors;
}
