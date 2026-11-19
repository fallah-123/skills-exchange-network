export async function lockSkill(db,userId,skillId) {
  return (await db.query("SELECT 1 FROM public.developer_skills WHERE user_id=$1 AND skill_id=$2 AND skill_type='offered' FOR UPDATE",[userId,skillId])).rowCount>0;
}
export async function find(db,id,lock=false) {
  return (await db.query('SELECT * FROM public.skill_verification_requests WHERE id=$1'+(lock?' FOR UPDATE':''),[id])).rows[0]??null;
}
export async function insert(db,userId,fields) {
  const row=(await db.query('INSERT INTO public.skill_verification_requests(user_id,skill_id,contribution,changed_by) VALUES($1,$2,$3,$1) RETURNING id',
    [userId,fields.skillId,fields.contribution])).rows[0];
  for (const [index,evidence] of fields.evidence.entries()) await db.query(
    'INSERT INTO public.skill_verification_evidence(request_id,position,url,description) VALUES($1,$2,$3,$4)',[row.id,index+1,evidence.url,evidence.description]);
  await db.query('UPDATE public.skill_verification_requests SET sealed=true WHERE id=$1',[row.id]);
  return row.id;
}
export async function change(db,id,actorId,{version,decision,feedback='',rubric={}}) {
  return (await db.query('UPDATE public.skill_verification_requests SET status=$3,version=version+1,changed_by=$2,feedback=$5,rubric=$6 WHERE id=$1 AND version=$4 RETURNING *',
    [id,actorId,decision,version,feedback,rubric])).rows[0]??null;
}
const select = `SELECT r.id,r.user_id AS "userId",u.display_name AS "displayName",r.skill_id AS "skillId",s.name AS "skillName",
 r.status,r.version,r.contribution,r.created_at AS "createdAt",r.updated_at AS "updatedAt"
 FROM public.skill_verification_requests r JOIN public.users u ON u.id=r.user_id JOIN public.skills s ON s.id=r.skill_id`;
export async function detail(db,id) {
  const row=(await db.query(select+' WHERE r.id=$1',[id])).rows[0];
  if (!row) return null;
  row.evidence=(await db.query('SELECT position,url,description FROM public.skill_verification_evidence WHERE request_id=$1 ORDER BY position',[id])).rows;
  row.history=(await db.query(`SELECT e.id,e.action,e.request_version AS version,e.actor_id AS "actorId",u.display_name AS "actorName",
    e.note,e.rubric,e.created_at AS "createdAt" FROM public.skill_verification_events e JOIN public.users u ON u.id=e.actor_id
    WHERE e.request_id=$1 ORDER BY e.request_version`,[id])).rows;
  return row;
}
export async function list(db,userId,{status,page,limit,skillId}) {
  const values=[userId,status??null,skillId??null];
  const where=' WHERE ($1::integer IS NULL OR r.user_id=$1) AND ($2::text IS NULL OR r.status=$2) AND ($3::integer IS NULL OR r.skill_id=$3)';
  const count=await db.query('SELECT count(*)::integer AS total FROM public.skill_verification_requests r'+where,values);
  const rows=await db.query(select+where+' ORDER BY r.created_at DESC,r.id DESC LIMIT $4 OFFSET $5',[...values,limit,(page-1)*limit]);
  return {data:rows.rows,meta:{page,limit,total:count.rows[0].total}};
}
export async function notify(db,id,version) {
  await db.query(`INSERT INTO public.notifications(recipient_id,actor_id,type,verification_event_id)
    SELECT r.user_id,e.actor_id,'verification_'||e.action,e.id FROM public.skill_verification_events e
    JOIN public.skill_verification_requests r ON r.id=e.request_id WHERE r.id=$1 AND e.request_version=$2`,[id,version]);
}
// Batch summaries avoid per-skill queries and expose no evidence or reviewer notes.
export async function badges(db,userIds) {
  if (!userIds.length) return new Set();
  const result=await db.query(`SELECT r.user_id,r.skill_id FROM public.skill_verification_requests r
    JOIN public.developer_skills ds ON ds.user_id=r.user_id AND ds.skill_id=r.skill_id AND ds.skill_type='offered'
    WHERE r.user_id=ANY($1::integer[]) AND r.status='approved'`,[userIds]);
  return new Set(result.rows.map(row=>row.user_id+':'+row.skill_id));
}
