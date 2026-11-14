# In-app notifications: local implementation and review

## Scope and release status

Implemented on `feature/in-app-notifications`, based on `main` at
`e1141027eceff02ec9cbd0bbeb6ff7c0ddff8107`. This is a local feature, not a
production release. No push, merge, hosted migration, deployment, environment
change, or Supabase setting change is part of this work.

The existing untracked backup documents/scripts and root `docs/` were preserved
and excluded from this feature's commit. No dependencies were added.

## Behavior and architecture

- Four events: new private message, received request, accepted request, rejected
  request. Only successfully committed business operations produce notifications.
- One unread message group per recipient/conversation. New sends increase its
  count and move it to the top; UUID retries do neither. A send after acknowledgement
  starts another group. The bell counts groups, not messages.
- The existing routes/controllers/services/repositories pattern is retained.
  Message insertion and notification aggregation share the existing transaction;
  request creation/response and its notification now share a transaction too.
  Notification failure rolls back the affected operation and returns an error.
- The list and unread count share a read-only repeatable-read snapshot. Pagination
  uses activity time and bigint ID; cursors retain PostgreSQL microseconds.
- Individual acknowledgement includes the displayed `lastMessageId`; stale
  activity receives `409 NOTIFICATION_UPDATED`. Repeated reads are idempotent.
  Bulk acknowledgement captures row IDs and message versions in a materialized
  statement snapshot, preserving later-created/updated activity.
- No message bodies or email addresses appear in notification responses. Ownership
  comes exclusively from the session; nonexistent and other-user IDs both return
  404. All responses are `no-store`; mutations reuse session-bound messaging CSRF.
- One React provider owns polling. Closed panels fetch counts; open panels fetch
  notifications and counts. Polling is every 30 seconds after completion, pauses
  while hidden/offline, resumes on return, prevents overlapping reads, and retries
  transient failures with bounded backoff. Logout/account changes cancel work,
  clear state/tokens, and reject late responses. No notification data is stored in
  localStorage.
- Bell/panel use the existing blue/teal styling, a `99+` badge, loading/error/empty
  states, individual/bulk reads, and Load more. Escape returns focus to the bell;
  outside focus/click closes the panel. Opening alone does not mark anything read.
- Notification links acknowledge the displayed version and navigate to an
  authorized conversation or the selected incoming/outgoing request.
- Each item has an accessible Clear action. A compact More disclosure contains
  Clear all read and Clear all notifications, preserving Mark all as read/Refresh.
  Clear all requires a native modal confirmation with Cancel focused by default,
  Escape cancellation, and focus restoration. It explains that messages and
  collaboration records remain untouched.

## Notification clearing

Clearing uses recipient-scoped DELETEs against the existing table. Migration 004
is unchanged; no additional migration, archive table or dependency is needed.

Individual clearing submits the displayed `lastMessageId` (null for requests).
If the message group changed, the API returns 409 and the UI refreshes the newer
activity instead of deleting it. Missing and other-recipient IDs both return 404.

Bulk clearing captures membership and message versions at the DELETE statement's
snapshot, not when the user first opens the confirmation dialog. Clear all read
captures only rows already read at that point. Rows inserted afterwards, message
groups changed during a lock wait, and rows acknowledged after a clear-read
snapshot survive. A future message starts a new group after the old group is
cleared; retrying an already-saved message does not recreate its notification.

All clearing routes require authentication, JSON and the existing CSRF token.
Deletion and count retrieval share a transaction with bounded lock/statement
timeouts. Only notification rows are removed. Responses identify the rows actually
deleted, so the UI immediately removes those IDs and updates the count, then
refreshes. Pending reads are cancelled and awaited before mutation; late results
cannot restore deleted rows. Pending actions are disabled and isolated per account.
There is no automatic network retry of deletion and no undo/archive facility.

Implementation detail beyond the basic table design: a PostgreSQL guard trigger
also verifies that actor, recipient and referenced message/request belong
together. It is invoker-security with a fixed `pg_catalog` search path.

## Database objects

`db/migrations/004_notifications.sql` adds only notification-owned objects:

- `public.notifications` and its bigint identity sequence.
- Primary key, five cascading foreign keys, and four checks (type, no self-event,
  positive count, valid reference shape).
- Two partial unique indexes: unread conversation group and request/event type.
- Two recipient/activity indexes, one limited to unread rows, plus the primary-key
  index.
- `notifications_guard()` and `notifications_guard_trg`.
- RLS enabled with no Data API policies; table/sequence/function privileges revoked
  from PUBLIC and existing `anon`, `authenticated`, and `service_role` roles.

Existing rows are not rewritten, removed, or backfilled. Deleting a referenced
user/request/conversation/latest message cascades to its dependent notification.
The Express database role remains responsible for authorized access.

## Endpoints

All paths below are under `/api/notifications` and require a session.

| Method/path | Purpose |
| --- | --- |
| `GET /` | Owner's page; `limit` 1–50, opaque `cursor`, optional `unread=true` |
| `GET /unread-count` | Owner's unread group count |
| `GET /csrf-token` | Existing session-bound CSRF protocol |
| `POST /:id/read` | JSON `{ "lastMessageId": "<displayed ID>" }`; null for requests |
| `POST /read-all` | JSON `{}`; acknowledge the statement's snapshot |
| `DELETE /:id` | JSON `{ "lastMessageId": "<displayed ID>" }`; clear one owned row; null for requests |
| `DELETE /read` | JSON `{}`; clear the owner's read-notification snapshot |
| `DELETE /` | JSON `{}`; clear the owner's full notification snapshot |

There is no public notification creation endpoint. IDs stay strings when they may
exceed JavaScript's safe integer range.

## Executed local verification

- Full backend suite after adding clearing: **101 passed, 0 failed**.
- Full frontend suite after adding clearing: **49 passed, 0 failed**.
- Frontend production build: **passed**.
- Database readiness including notifications: **passed**.
- Guarded 004 rehearsal: read-only preflight, incorrect-target refusal,
  unexpected-object refusal, injected mid-DDL failure/rollback, successful apply,
  repeat-apply refusal, and exact preservation of rows in all eight original
  application tables: **passed**.
- Existing application integration: **8 passed**, covering health/proxy,
  registration/login/sessions/logout, profiles, skills, matching and requests.
- Existing messaging integration: **passed**, including real polling, pause/resume,
  emojis/multiline, session expiration, and 35-message history across account switches.
- Notification integration: **passed**, covering all four events, actual 30-second
  polling, opening without acknowledgement, message retry grouping, stale reads,
  individual/bulk synchronization, navigation targets, recipient privacy, account
  switching and persistent history. Clearing checks also cover individual/read/all
  removal, confirmation/cancellation, retained messages, recipient isolation and
  removal persisting across login. This is an API/store integration check; Node
  supplies a visible/online lifecycle rather than rendering a browser DOM.
- Backend concurrency tests cover simultaneous sends, competing request decisions,
  reads blocked by a concurrent writer, and bulk snapshot races. Failure injection
  verifies transactional rollback. Database tests exercise constraints, RLS and
  role revocations.
- Clearing race tests cover a delete waiting on a new message, bulk snapshots
  while new events arrive, clear-read racing with acknowledgement, and a send
  waiting on group deletion. Frontend tests cover confirmation gating, cancellation,
  duplicate clicks, error recovery, stale polls and account switching mid-clear.

One existing messaging RLS test required a fixture correction: it temporarily
grants schema USAGE inside its rolled-back test transaction, so it tests RLS rather
than failing first on schema access. No production permissions were changed.

The user completed manual review of the original notification implementation.
For this clearing enhancement, browser automation reported that the browser access
host was unavailable. No rendered-browser checks of the new controls are claimed.
Manual visual, keyboard, touch, screen-reader, and dialog verification remain.

## Current local preview

Open **http://127.0.0.1:5176/** while the updated preview processes remain running.
Use this URL for clearing review; the earlier preview used an older backend.

- API: `127.0.0.1:4103`.
- PostgreSQL: `127.0.0.1:55439`.
- Preview database: `sen_notifications_preview_20261115_test`.
- Automated suite database: `sen_notifications_20261115_test` (separate from preview).
- Both use disposable local records; hosted Supabase was not contacted.

Register two or three local accounts with your own test credentials. Use separate
browser profiles or a normal/private window to hold multiple sessions. Synthetic
automation account passwords are not published or stored in this guide.

1. Send a collaboration request. Wait up to 30 seconds in the recipient's visible,
   online tab. Open the bell; it should remain unread. Click its link and confirm
   the matching request is selected in the incoming view.
2. Accept it and verify the sender's accepted notification/outgoing request link.
   Use a third account for a rejected-request scenario.
3. Send several messages, including emoji and multiple lines. Confirm one unread
   group shows the correct count and opens the correct conversation.
4. Mark the group read, send another message, and confirm a new unread group.
   Check individual read and Mark all as read, including refresh persistence.
5. Log out and switch accounts in the same browser. No previous user's
   notifications should appear. Previously saved history should return on login.
6. Check bell/panel on desktop and mobile widths, keyboard Tab/Enter/Escape,
   focus indicators, outside-click close, error/retry states and Load more.
   Refresh/polling currently returns the list to the latest page; Load more can
   retrieve older notifications again.
7. Hide the tab or go offline, then return/reconnect. Confirm polling resumes.
8. Clear an individual unread group and confirm its badge disappears while its
   conversation/messages remain. Send another message and confirm a fresh group.
9. Mix read/unread items, choose More → Clear all read, and confirm only read items
   disappear. Try again when no read items remain; there should be no failure.
10. Choose More → Clear all notifications. Cancel, then try Escape; both must keep
    history. Confirm a subsequent attempt and check the empty state/count. Refresh
    and log in again to confirm removal persists. Check another account is unchanged.
11. At mobile widths and with keyboard only, check More, individual Clear, native
    dialog focus containment, initial Cancel focus, Escape and focus restoration.

Notifications start with new activity after 004; there is no historical backfill.
Notification acknowledgement is independent of message history or read receipts.
Delivery is periodic, not instant. Nothing is sent by email or browser push.

## Restarting locally / rerunning checks

Use a local PostgreSQL server and supply the following **process environment** in
a backend terminal. Do not edit the hosted environment or reuse hosted credentials.
The existing local server must still be listening on 55439 (use its actual port
if restarted differently).

```powershell
cd backend
$env:NODE_ENV='test'
$env:PORT='4103'
$env:DB_HOST='127.0.0.1'
$env:DB_PORT='55439'
$env:DB_NAME='postgres'
$env:DB_NAME_TEST='sen_notifications_preview_20261115_test'
$env:DB_USER='postgres'
$env:DB_PASSWORD=[System.Net.NetworkCredential]::new('', (Read-Host 'Local PostgreSQL password' -AsSecureString)).Password
$env:SESSION_SECRET=node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('hex'))"
$env:DB_SSL_CA_FILE=''
npm.cmd run check:db
node --input-type=module -e "const {createApp}=await import('./src/app.js'); const {default:pool}=await import('./src/db/pool.js'); createApp(pool).listen(4103,'127.0.0.1');"
```

The password is entered privately into the local process environment, never into
source control. A fresh session secret means previous local sessions must log in
again. The empty CA override above is only for the isolated local test server;
production TLS configuration is untouched. Close the terminal to discard its
process environment. Do not run test-schema reset commands against the preview.

In another terminal:

```powershell
cd frontend
$env:API_PROXY_TARGET='http://127.0.0.1:4103'
$env:VITE_API_URL=''
npm.cmd run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

In a third frontend terminal, with the isolated preview running:

```powershell
$env:INTEGRATION_TARGET_IS_TEST_DB='yes'
$env:INTEGRATION_ORIGIN='http://127.0.0.1:5176'
npm.cmd test
npm.cmd run build
npm.cmd run check:integration
npm.cmd run check:messaging
npm.cmd run check:notifications
```

The integration commands create synthetic local accounts and preserve existing
records. For backend tests, use a separate terminal configured as above but set
`DB_NAME_TEST=sen_notifications_20261115_test`, then run `npm.cmd test`. The backend
suite resets records in that designated test database. `check:migration:notifications`
creates and removes its own unique disposable database; its local role needs
CREATEDB and event-trigger privileges for rollback testing.

## Guarded 004 procedure (prepared, not authorized for production)

The runner defaults to read-only preflight:

```text
npm run db:migrate:notifications
```

Applying requires `--apply --expected-host <host> --expected-database <database>
--expected-user <user>` matching the configured connection. A non-loopback host
also requires `--allow-hosted` and separate explicit deployment authorization.
The script checks the connected identity, existing 001–003 readiness, unexpected
notification objects, and post-004 readiness inside its transaction. It rejects
repeat/partial applications rather than attempting repairs. Use `check:db` after
an already-successful apply instead of rerunning it.

Do not release this backend before 004 is applied to its target: request/message
writes now require the notification table. A future approved release should
apply additive 004, verify readiness, deploy the backend, then the frontend.
Vercel/Render repository auto-deploy behavior must be considered at that time.
Do not rerun the initial schema, test reset script, or migration 003 on production.
