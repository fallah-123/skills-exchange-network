# Private messaging storage — step 2

Migration: `db/migrations/003_private_messaging.sql`.

This document describes the storage prepared in step 2. The messaging API is now
implemented in step 3; see [MESSAGING_API.md](MESSAGING_API.md). The UI and polling
loop are also implemented and verified. Applying the migration to the application database is a
release step; creating this file does not change Supabase.

See [MESSAGING_RELEASE.md](MESSAGING_RELEASE.md) for current verification results,
verified TLS configuration, and the guarded production migration command.

## Data model

`conversations` contains an integer identity `id`, a unique
`collaboration_request_id`, and server-defaulted `created_at` (`timestamptz`).
The request supplies the two participants, so participant identities cannot drift
between two copies of the relationship. A trigger requires the request to be
accepted. The existing request constraints prevent a second accepted connection
between the same pair and prevent changing its participants or accepted status.

`messages` contains:

| Column | Contract |
|---|---|
| `id` | PostgreSQL bigint identity; preserve its string representation in JSON and cursors to avoid JavaScript number precision loss |
| `conversation_id` | Foreign key to the conversation |
| `sender_id` | Foreign key to a user; a trigger requires membership in the accepted connection |
| `client_message_id` | Required UUID, generated once per send and reused for retries |
| `body` | Required text, 1–2,000 PostgreSQL characters, with at least one non-whitespace character |
| `created_at` | Server-defaulted timestamp with timezone |

The unique key `(conversation_id, sender_id, client_message_id)` makes concurrent
retries safe at the storage layer. Body text is stored literally; the frontend
must render it as text rather than HTML. Application validation should count
Unicode code points to match PostgreSQL `char_length` (for example,
`Array.from(body).length`), rather than JavaScript UTF-16 code units.

Conversation fields and saved message fields are immutable. There is no edit or
delete HTTP feature in this version. Foreign keys follow the existing deletion
model: deleting a collaboration request deletes its conversation and messages;
deleting either participant cascades through the request and removes the entire
shared conversation, including messages written by the other participant.

The unique request index supports opening a conversation. The message history
index `(conversation_id, id DESC)` supports bounded queries and older-message
pagination; a sender/time index supports foreign-key cleanup and the API's
sliding-window send limit.

## Supabase privacy boundary

The application authenticates through Express sessions and connects to PostgreSQL
as the table owner (`postgres` in the verified configuration). Supabase JWT roles
do not identify these application users.

Both new tables enable RLS with no client policies. The migration revokes access
to their tables, identity sequences, and trigger functions from `PUBLIC` and from
`anon`, `authenticated`, and `service_role` when those roles exist. This overrides
the broad default grants observed in the project's Supabase `public` schema.
It does not alter default privileges or permissions on existing tables.

Trigger functions use invoker privileges and a fixed `pg_catalog` search path,
with explicit `public` table references. There are no security-definer functions.
The backend's owner connection can still read all rows: **the API must authorize
every conversation read and write using the session user**. RLS here prevents
direct client access; it does not replace the Express authorization checks.
If the backend later uses a different database role, its grants and RLS access
must be designed explicitly rather than granting the client roles access.

## Requirements for the API implementation

- Derive `sender_id` from the authenticated session, never from a client claim.
- Check membership and accepted status when opening, listing, reading, and sending.
- Open conversations lazily for existing accepted requests. On a concurrent
  creation conflict, retrieve the single existing conversation.
- On a duplicate client UUID, return the existing message only if its body agrees;
  reject a reused identifier with a different body. Never overwrite a saved message.
- Generate timestamps in SQL. Do not accept client-supplied IDs or timestamps.
- Use bounded history queries and string message IDs. Identity values can have
  gaps and are not guaranteed to commit in allocation order. Any incremental
  polling cursor must account for concurrent sends (for example, serialize sends
  by locking the conversation in a transaction **before** inserting a message).
- Apply send limits and CSRF protection, and configure verified TLS for the hosted
  database connection before deploying private messaging.

## Migration and verification

Apply migrations 001, 002, then 003 to an isolated test database. The existing
`npm run db:test:setup` reads SQL migrations in filename order, and `npm test`
includes `tests/api/messaging.database.test.js`. The test reset now includes both
new tables. These commands require a separate `DB_NAME_TEST` ending in `_test`;
the setup command recreates that test database's `public` schema.

Migration 003 runs in a transaction and uses a five-second lock timeout. It does
not backfill conversations or alter existing application records. It is intended
to run once; an existing table/function name causes failure rather than silently
accepting an unknown schema. After an error, roll back the failed transaction
before inspecting or retrying it. Do not use the destructive test setup script to
apply a production migration.

The database tests cover accepted-only conversations, concurrent duplicates,
participant checks, body limits, retry identifiers, immutable records, history
pagination, persistence across connections, cascade behavior, RLS, and grants.
The two Supabase-role tests explicitly skip when those roles are absent. To
exercise them, provision `anon`, `authenticated`, and `service_role` on an isolated
local PostgreSQL instance and grant them schema usage plus default table,
sequence, and function privileges **before** applying migration 003. Keep this
test fixture out of the application database.

## Step 2 verification results

Verified on an isolated local PostgreSQL 17 instance with temporary credentials;
the application's `.env` was not changed and Supabase was not migrated.

- All 48 backend tests passed, including 16 messaging database tests, with no skips.
- The test instance reproduced Supabase's broad default grants for `anon`,
  `authenticated`, and `service_role` before migration 003; the privacy tests
  confirmed that those grants were revoked on the new objects.
- Upgrading a schema containing synthetic records preserved every record in all
  six existing tables and left the new tables empty. An already accepted request
  could then open a conversation.
- A deliberate conflicting `messages` table caused migration rollback, preserving
  that table and leaving no partial `conversations` table.
- The existing `db:test:setup` command applied all three migrations to a fresh
  isolated database successfully.
- A committed test message and all eight tables survived a full PostgreSQL restart.
- The temporary PostgreSQL instance was shut down after verification.

Step 2 is complete. The later application-database rollout completed on November
10, 2026; see ACADEMIC_RELEASE_STATUS.md. The API is documented in MESSAGING_API.md.
