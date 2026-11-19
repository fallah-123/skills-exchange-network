import AppError from '../utils/AppError.js';
export async function assertAdmin(db,userId,lock=false) {
  const result=await db.query('SELECT role FROM public.users WHERE id=$1'+(lock?' FOR SHARE':''),[userId]);
  if (result.rows[0]?.role!=='admin') throw new AppError(403,'ADMIN_REQUIRED','Administrator access is required.');
}
export default function requireAdmin(req,res,next) {
  assertAdmin(req.app.locals.pool,req.userId).then(()=>next(),next);
}
