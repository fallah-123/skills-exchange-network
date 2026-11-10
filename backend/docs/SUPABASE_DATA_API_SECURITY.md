# Supabase Data API assessment

Reviewed November 10, 2026 for project `dxeihpzllvrfzqakcekz`.
The owner subsequently confirmed the unused Data API is disabled. Live Express
health, authentication and all nine acceptance groups passed afterward. This
dashboard state is owner-confirmed; an authenticated Data API HTTP probe was not
performed. Original-table grants and policies were not changed. Migration 003
has now added its own restricted messaging objects.

## Application dependency

The React client calls Express through Vercel's `/api` reverse proxy. Express
uses `pg` and a PostgreSQL connection. Source and dependency inspection found no
Supabase client SDK or direct REST/GraphQL Data API calls. The messaging feature
uses Express polling, not Supabase Realtime.

## Verified database findings

Earlier read-only inspection during this preparation found RLS disabled on all
six original public tables: `users`, `developer_profiles`, `skills`,
`developer_skills`, `collaboration_requests`, and `user_sessions`.
The `anon` and `authenticated` roles have schema access and broad table grants,
including SELECT, INSERT, UPDATE, DELETE and TRUNCATE. A read-only transaction
using `SET LOCAL ROLE anon` successfully selected zero rows with `LIMIT 0` from
each table, demonstrating permissions without retrieving user content.
Default privileges also grant API roles access to newly created objects.

If the Data API is enabled and exposes `public`, those grants and lack of RLS
permit access outside Express authorization. This could expose password hashes,
session records and application data, and allow unauthorized changes. This is a
release concern even though current records are disposable. It is not proof of
an actual breach. Active API settings and an authenticated HTTP API test were
not available; HTTP 401 without an API key does not establish table protection.

## Remediation completed by the owner

Keep **Enable Data API** off in **Integrations > Data API > Overview**. The owner
confirmed this action before release. This application uses
direct PostgreSQL, so its Express database path does not depend on this API.
Recheck Express health and login afterward. Do not disable the database itself
or reset credentials. See [Supabase's supported Data API controls](https://supabase.com/docs/guides/api/securing-your-api).

If another integration requires Data API, stop and review narrowly scoped grant
revocations/RLS for the application tables and sequences instead. Do not copy
`auth.uid()` policies into this application: Express sessions are not Supabase
Auth JWT identities. Include callable functions and default privileges in that
review. No permission-changing SQL has been executed.

Migration 003 separately enables RLS without client policies and revokes API-role
privileges for its new messaging tables, sequences and trigger functions. It
does not fix grants on the six original tables. Keep Data API disabled unless a
future, separately tested API access design explicitly requires it.
