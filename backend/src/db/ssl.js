import { readFileSync } from 'node:fs';

// Hosted connections verify both the certificate chain and hostname.
export function databaseSsl({ nodeEnv, host, caFile }, readFile = readFileSync) {
  const local = ['localhost', '127.0.0.1', '::1'].includes(host);
  if (nodeEnv !== 'production' && local && !caFile) return false;
  const supabase = /^db\.[a-z0-9]+\.supabase\.co$/.test(host) || /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(host);
  const certificate = caFile || (supabase ? new URL('../../db/certs/prod-ca-2021.crt', import.meta.url) : undefined);
  return {
    rejectUnauthorized: true,
    ...(certificate ? { ca: readFile(certificate, 'utf8') } : {})
  };
}
