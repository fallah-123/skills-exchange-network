# Private messaging release

The academic-demo release was deployed on November 10, 2026. See
[release results and verification limits](ACADEMIC_RELEASE_STATUS.md) for the
commits, live URLs, migration evidence, test results and browser handoff.

## Architecture

Vercel forwards same-origin `/api` requests to Render. Keep `VITE_API_URL` unset.
Render uses NODE_ENV=production and connects directly to Supabase PostgreSQL with
verified TLS and the bundled public CA. Session cookies are Secure, HttpOnly,
SameSite=Lax, host-only and scoped to `/`. Existing sessions upgrade their cookie
policy without changing identity; logout invalidates the stored session.

Messaging requires an accepted collaboration request. Express scopes every read
and write to the two participants. Migration 003 enables RLS without API policies
and revokes Supabase API-role access to the messaging objects. Existing tables
retain their earlier permissions; keep the unused Data API disabled.

## Migration status and future changes

Migration 003 has been applied to project `dxeihpzllvrfzqakcekz`. Do not reapply it,
reset the schema or run test setup against Supabase. The runner deliberately
refuses already-present messaging tables. Use `npm run check:db` with explicit,
verified production connection settings for read-only readiness checks.

The migration creates conversations/messages with identity sequences, constraints,
indexes and guard triggers. It does not backfill or change existing records.
Deleting a user or collaboration request later can cascade to related messages;
do not use such deletions as a deployment rollback.

## Safe release and recovery

Backend compatibility must precede frontend deployment. Main-branch pushes trigger
both Render and Vercel automatically. Run backend tests only against an isolated
local database; run frontend tests/build before pushing frontend changes.

If a future deployment fails, preserve messaging tables and data. Retain verified
TLS and secure cookies in corrective releases. Do not roll back to pre-`fbdf026`
code under Supabase SSL enforcement: that code cannot make the required trusted
connection with the old development configuration. Never disable TLS verification
or SSL enforcement to recover.

The live acceptance helper creates its own disposable demonstration records and
requires explicit authorization. See its usage and limits in the release results.
