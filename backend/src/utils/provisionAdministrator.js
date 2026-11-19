// Caller owns target validation and the transaction. No HTTP route exposes this.
export async function provisionAdministrator(db, userId, expectedEmail, apply) {
  const row = (await db.query('SELECT id,email,role FROM public.users WHERE id=$1' + (apply ? ' FOR UPDATE' : ''), [userId])).rows[0];
  if (!row || row.email !== expectedEmail.trim().toLowerCase() || row.role !== 'developer') {
    throw new Error('Account is missing, does not match, or is already privileged.');
  }
  if (apply) {
    const changed = await db.query("UPDATE public.users SET role='admin' WHERE id=$1 AND role='developer'", [userId]);
    if (changed.rowCount !== 1) throw new Error('Expected exactly one account role change.');
    await db.query("DELETE FROM public.user_sessions WHERE sess->>'userId'=$1", [String(userId)]);
  }
}
