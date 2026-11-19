// Operator tools require an exact configured target before opening a connection.
export function validateOperatorTarget(values,database) {
  for(const [flag,key] of [['expected-host','host'],['expected-database','name'],['expected-user','user']]) {
    if(!values[flag] || values[flag]!==database[key]) throw new Error('Explicit expected host, database and database user must match configuration.');
  }
  if(!['localhost','127.0.0.1','::1'].includes(database.host) && !values['allow-hosted'])
    throw new Error('Hosted targets require separate release approval and --allow-hosted.');
}
export function validateAccountSelection(values) {
  const id=Number(values['user-id']);
  if(!/^[1-9]\d*$/.test(values['user-id']||'') || !Number.isSafeInteger(id)||id>2147483647 ||
     !values['expected-email'] || (values.apply&&values['confirm-user-id']!==values['user-id']))
    throw new Error('Provide a specific user ID and expected email; apply also requires --confirm-user-id matching that ID.');
  return id;
}
export async function verifyConnectedTarget(db,database) {
  const target=(await db.query('SELECT current_database() AS database,current_user AS role')).rows[0];
  const role=database.user.startsWith('postgres.')?'postgres':database.user;
  if(target.database!==database.name||target.role!==role) throw new Error('Connected database identity mismatch.');
}
