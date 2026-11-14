export async function checkNotificationReadiness(db) {
  const errors = [];
  const table = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid = to_regclass('public.notifications')");
  if (!table.rowCount) return ['Missing table: notifications'];
  if (!table.rows[0].relrowsecurity) errors.push('RLS disabled: notifications');
  const policies = await db.query("SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'notifications'");
  if (policies.rowCount) errors.push('Notifications must have no Data API policies.');
  const constraints = await db.query("SELECT conname, convalidated FROM pg_constraint WHERE conrelid = 'public.notifications'::regclass");
  for (const name of ['notifications_pkey', 'notifications_type_valid', 'notifications_no_self', 'notifications_count_valid',
    'notifications_reference_shape', 'notifications_recipient_id_fkey', 'notifications_actor_id_fkey',
    'notifications_collaboration_request_id_fkey', 'notifications_conversation_id_fkey', 'notifications_last_message_id_fkey']) {
    if (!constraints.rows.some(row => row.conname === name && row.convalidated)) errors.push(`Missing or invalid constraint: ${name}`);
  }
  const indexes = await db.query(`SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
    WHERE i.indrelid = 'public.notifications'::regclass AND i.indisvalid`);
  for (const name of ['notifications_unread_conversation_key', 'notifications_request_event_key', 'notifications_recipient_activity_idx', 'notifications_recipient_unread_idx']) {
    if (!indexes.rows.some(row => row.relname === name)) errors.push(`Missing or invalid index: ${name}`);
  }
  const guards = await db.query(`SELECT p.prosecdef, p.proconfig FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.notifications'::regclass AND t.tgname = 'notifications_guard_trg' AND t.tgenabled IN ('O', 'A')`);
  if (guards.rowCount !== 1 || guards.rows[0].prosecdef || !guards.rows[0].proconfig?.includes('search_path=pg_catalog')) errors.push('Notifications guard missing, disabled or unsafe.');
  const objects = await db.query(`SELECT c.oid, c.relkind, c.relname,
      EXISTS (SELECT 1 FROM aclexplode(COALESCE(c.relacl, acldefault(CASE WHEN c.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END, c.relowner))) a WHERE a.grantee = 0) AS public_access
    FROM pg_class c WHERE c.oid IN ('public.notifications'::regclass, pg_get_serial_sequence('public.notifications','id')::regclass)`);
  if (objects.rowCount !== 2 || objects.rows.some(row => row.public_access)) errors.push('Notifications table/sequence missing or exposed to PUBLIC.');
  const fn = await db.query(`SELECT p.oid, EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a WHERE a.grantee = 0) AS public_access
    FROM pg_proc p WHERE p.oid = to_regprocedure('public.notifications_guard()')`);
  if (fn.rowCount !== 1 || fn.rows[0].public_access) errors.push('Notifications guard function missing or exposed to PUBLIC.');
  if (fn.rowCount && objects.rowCount === 2) {
    const grants = await db.query(`SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') AND (
      has_table_privilege(oid,'public.notifications','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR
      has_sequence_privilege(oid,pg_get_serial_sequence('public.notifications','id'),'USAGE,SELECT,UPDATE') OR
      has_function_privilege(oid,'public.notifications_guard()','EXECUTE'))`);
    if (grants.rowCount) errors.push('Notifications privileges exposed to Data API roles.');
  }
  return errors;
}
