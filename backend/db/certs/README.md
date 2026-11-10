# Supabase database trust certificate

`prod-ca-2021.crt` is a **public CA certificate**, not a private key or credential.
Downloaded over verified HTTPS from the URL referenced by the
[official Supabase dashboard configuration](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json):

https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt

- Certificate SHA-256 fingerprint: `80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA`
- File SHA-256: `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`
- Valid until April 26, 2031. Recheck the provider's certificate before renewal or rotation.

The backend automatically loads it only for Supabase database/pooler hostnames.
`DB_SSL_CA_FILE` overrides this choice when a provider issues a replacement CA.
Every hosted database connection verifies the certificate chain and hostname;
local non-production PostgreSQL can run without TLS.

See [Supabase SSL guidance](https://supabase.com/docs/guides/platform/ssl-enforcement).
