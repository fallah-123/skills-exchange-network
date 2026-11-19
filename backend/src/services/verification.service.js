import AppError from '../utils/AppError.js';
import {withTransaction} from '../db/transaction.js';
import {assertAdmin} from '../middleware/requireAdmin.js';
import * as repository from '../repositories/verification.repository.js';
const missing=()=>new AppError(404,'VERIFICATION_NOT_FOUND','The verification request was not found.');
async function transaction(pool,run) {
  try {return await withTransaction(pool,async db=>{
    await db.query("SET LOCAL lock_timeout='5s'");await db.query("SET LOCAL statement_timeout='10s'");
    return run(db);
  });} catch(error) {
    if (error.constraint==='skill_verification_one_active') throw new AppError(409,'VERIFICATION_ACTIVE','This skill already has a pending request or approval.');
    if (['55P03','57014','40P01'].includes(error.code)) {
      const busy=new AppError(503,'VERIFICATION_BUSY','Review is busy. Refresh before trying again.');busy.retryAfter=2;throw busy;
    }
    throw error;
  }
}
export async function submit(pool,userId,fields) {
  return transaction(pool,async db=>{
    await db.query('SELECT pg_advisory_xact_lock(1297303374,$1)',[userId]);
    if (!await repository.lockSkill(db,userId,fields.skillId)) throw new AppError(409,'OFFERED_SKILL_REQUIRED','Add this skill to your offered skills first.');
    if ((await db.query("SELECT 1 FROM public.skill_verification_requests WHERE user_id=$1 AND skill_id=$2 AND status IN ('pending','approved')",[userId,fields.skillId])).rowCount)
      throw new AppError(409,'VERIFICATION_ACTIVE','This skill already has a pending request or approval.');
    const count=(await db.query("SELECT count(*)::integer AS total FROM public.skill_verification_requests WHERE user_id=$1 AND created_at>clock_timestamp()-interval '1 hour'",[userId])).rows[0].total;
    if (count>=10) {const error=new AppError(429,'VERIFICATION_RATE_LIMITED','Too many submissions. Please try again later.');error.retryAfter=3600;throw error;}
    return repository.detail(db,await repository.insert(db,userId,fields));
  });
}
export async function list(pool,userId,query,admin=false) {
  if (admin) await assertAdmin(pool,userId);
  return repository.list(pool,admin?query.userId:userId,query);
}
export async function detail(pool,userId,id,admin=false) {
  if (admin) await assertAdmin(pool,userId);
  const row=await repository.find(pool,id);
  if (!row || (!admin && row.user_id!==userId)) throw missing();
  return repository.detail(pool,id);
}
export async function decide(pool,userId,id,fields,admin=false) {
  return transaction(pool,async db=>{
    if (admin) await assertAdmin(db,userId,true);
    let row=await repository.find(db,id);
    if (!row || (!admin && row.user_id!==userId)) throw missing();
    if (admin && row.user_id===userId) throw new AppError(403,'SELF_REVIEW','You cannot review your own submission.');
    // All approval and removal paths lock the assignment before the request.
    const offered=await repository.lockSkill(db,row.user_id,row.skill_id);
    row=await repository.find(db,id,true);
    const decision=admin?fields.decision:'withdrawn';
    const expected=decision==='revoked'?'approved':'pending';
    if (row.version!==fields.version || row.status!==expected)
      throw new AppError(409,'VERIFICATION_CHANGED','This request has changed. Refresh and review its current state.');
    if (decision==='approved' && !offered) throw new AppError(409,'OFFERED_SKILL_REQUIRED','This skill is no longer offered.');
    await repository.change(db,id,userId,{...fields,decision,feedback:admin?fields.feedback:'Withdrawn by the developer.'});
    if (admin) await repository.notify(db,id,row.version+1);
    return repository.detail(db,id);
  });
}
