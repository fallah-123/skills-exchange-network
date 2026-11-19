export async function checkVerificationReadiness(db,{notifications=true}={}) {
  const errors=[];
  const names=['skill_verification_requests','skill_verification_evidence','skill_verification_events'];
  const tables=(await db.query("SELECT c.relname,c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname=ANY($1::text[])",[names])).rows;
  for(const name of names) if(!tables.some(t=>t.relname===name&&t.relrowsecurity)) errors.push('Missing or unprotected verification table: '+name);
  const role=(await db.query("SELECT 1 FROM pg_attribute WHERE attrelid='public.users'::regclass AND attname='role' AND attnotnull AND NOT attisdropped")).rowCount;
  if(!role) errors.push('Missing users.role');
  if(tables.length!==3) return errors;
  const functions=['verification_guard_request','verification_require_sealed','verification_guard_evidence','verification_guard_event','verification_record_event','verification_retire_skill'];
  const safe=(await db.query("SELECT p.proname,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[])",[functions])).rows;
  for(const name of functions) if(!safe.some(f=>f.proname===name&&!f.prosecdef&&f.proconfig?.includes('search_path=pg_catalog'))) errors.push('Unsafe or missing verification function: '+name);
  const triggers=['verification_request_guard','verification_submission_complete','verification_evidence_guard','verification_event_guard','verification_request_audit','verification_skill_removal'];
  const enabled=(await db.query("SELECT tgname FROM pg_trigger WHERE tgname=ANY($1::text[]) AND tgenabled IN ('O','A')",[triggers])).rows;
  for(const name of triggers) if(!enabled.some(t=>t.tgname===name)) errors.push('Missing verification trigger: '+name);
  const indexes=(await db.query("SELECT c.relname FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE c.relname=ANY($1::text[]) AND i.indisvalid AND i.indisunique",[['skill_verification_one_active','skill_verification_events_request_id_request_version_key']])).rows;
  if(indexes.length!==2) errors.push('Missing verification uniqueness protections');
  if((await db.query("SELECT 1 FROM pg_constraint WHERE conrelid=ANY($1::regclass[]) AND NOT convalidated",[names.map(n=>'public.'+n)])).rowCount) errors.push('Unvalidated verification constraint');
  if((await db.query("SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=ANY($1::text[])",[names])).rowCount) errors.push('Verification Data API policies must not exist');
  const objects=(await db.query(`SELECT c.oid,c.relkind, EXISTS(SELECT 1 FROM aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) a WHERE a.grantee=0) AS exposed
    FROM pg_class c WHERE c.oid=ANY($1::regclass[]) OR c.oid IN (pg_get_serial_sequence('public.skill_verification_requests','id')::regclass,pg_get_serial_sequence('public.skill_verification_events','id')::regclass)`,[names.map(n=>'public.'+n)])).rows;
  if(objects.length!==5||objects.some(o=>o.exposed)) errors.push('Verification tables/sequences exposed or missing');
  for(const object of objects) {
    const fn=object.relkind==='S'?'has_sequence_privilege':'has_table_privilege';
    const permissions=object.relkind==='S'?'USAGE,SELECT,UPDATE':'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER';
    if((await db.query(`SELECT 1 FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role') AND ${fn}(oid,$1::oid,$2)`,[object.oid,permissions])).rowCount) errors.push('Verification object accessible to Data API role');
  }
  const fnGrants=await db.query(`SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY($1::text[]) AND
    (EXISTS(SELECT 1 FROM aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE a.grantee=0)
     OR EXISTS(SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role') AND has_function_privilege(r.oid,p.oid,'EXECUTE')))`,[functions]);
  if(fnGrants.rowCount) errors.push('Verification functions exposed to Data API roles');
  if(notifications) {
    if(!(await db.query("SELECT 1 FROM pg_attribute WHERE attrelid='public.notifications'::regclass AND attname='verification_event_id' AND NOT attisdropped")).rowCount) errors.push('Missing notification verification reference');
    if(!(await db.query("SELECT 1 FROM pg_index WHERE indexrelid=to_regclass('public.notifications_verification_event_key') AND indisvalid AND indisunique")).rowCount) errors.push('Missing verification notification uniqueness');
  }
  return errors;
}
