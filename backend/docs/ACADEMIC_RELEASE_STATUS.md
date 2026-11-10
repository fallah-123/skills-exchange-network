# Academic demonstration release results

Verified November 10, 2026. The application release is complete at the API and
static-delivery level. Browser interaction limitations are recorded below.

## Live application

- Frontend: https://frontend-eta-fawn-j8xf3k2cfw.vercel.app
- Backend: https://skills-exchange-network.onrender.com
- Verified Supabase project: `dxeihpzllvrfzqakcekz`.
- Connection: `aws-0-ap-southeast-2.pooler.supabase.com:5432`, database `postgres`,
  session-pooler username `postgres.dxeihpzllvrfzqakcekz`.

## Deployment sequence completed

1. Pushed TLS-only repair `fbdf026` first. Hosted database connections now verify
   TLS even when NODE_ENV is development. The bundled public Supabase CA remains
   trusted; certificate verification was never disabled. Both client TLS 1.3
   authorization and PostgreSQL's upstream TLS check passed after SSL enforcement.
2. Verified live registration, login, session persistence and logout through
   Vercel before changing the schema. Existing login functionality was restored.
3. Applied only `003_private_messaging.sql` with the existing guarded migration
   runner and verified target arguments. `npm run check:db` passed. Nine messaging
   constraints, six indexes and two guard triggers were independently verified.
   RLS and API-role restrictions passed readiness checks.
4. The owner staged Render NODE_ENV=production using Save only. Pushed backend
   release `bb9ec7a`, retaining database credentials and SESSION_SECRET. Live
   cookies verified Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain attribute.
5. Pushed frontend release `1aba965`. Vercel reports successful deployment, and
   the live `/messages` route serves the exact JavaScript checksum of the tested
   production build (`/assets/index-BdtD13op.js`). Existing reverse-proxy rewrites
   were preserved; no Vercel environment variables were added.

The fresh frontend release also triggers Render under the existing On Commit
workflow. Backend deployment success was verified through live endpoint behavior,
verified database connectivity and production cookie flags; authenticated Render
build logs and deployment IDs were not accessible from this environment.

## Verification results

| Check | Result |
| --- | --- |
| TLS helper tests | 3 passed |
| Full backend suite | 82 passed; no failures/skips; isolated local PostgreSQL database |
| Frontend suite | 31 passed; no failures/skips |
| Frontend production build | Passed |
| Git diff whitespace check | Passed |
| Live frontend bundle | Exact SHA-256 match to tested build |
| Live acceptance | 9 groups passed through Vercel HTTPS |
| Live schema readiness | Passed, including RLS and restricted API roles |

Live acceptance verified registration/login, repeated session requests, secure
cookie flags, profile persistence, skill add/remove, developer discovery, mutual
matching, request authorization/acceptance, shared conversations, third-account
read/write denial, CSRF rejection, retry deduplication, emoji and multiline text,
all 35 messages across recent/older pages, incremental history, logout denial,
and re-login with persisted conversation history. Demo sessions were logged out.

The repeatable acceptance script is `backend/scripts/check-live-demo.mjs`. It
requires explicit `LIVE_DEMO_CHECK=approved`, creates three disposable accounts
and their records, and never resets tables or changes pre-existing accounts.
Each run adds new test records. Passwords and session cookies remain in memory
and are not printed. Do not run it without permission to create live records.

## Existing data and security

Original table counts were identical immediately before and after migration:
users 3, developer_profiles 3, skills 35, developer_skills 20,
collaboration_requests 0, user_sessions 1. Subsequent acceptance tests intentionally
added their own disposable accounts, profiles, skill assignments, connection and
messages. No database reset or existing-data deletion occurred.

The owner confirmed Supabase SSL enforcement enabled and unused Data API disabled.
The application uses direct PostgreSQL through Express, not the Supabase Data API.
See [the separate API-role assessment](SUPABASE_DATA_API_SECURITY.md). No existing
API-role grants were changed; keep Data API disabled unless a future reviewed
access design protects the original application tables.

Database credentials and SESSION_SECRET were preserved. No credentials, private
backups, local .env files or unrelated root documents were committed. Elaborate
backup/restore was waived for disposable test data; earlier backup artifacts are
not claimed as fully verified.

## Limits and demonstration handoff

No critical failure remains in the checks performed. Browser control reported
`The browser access host is unavailable`, so visual rendering, emoji-picker clicks,
automatic scrolling and multi-tab interaction were not exercised in a live browser
in this release run. Polling/history/account-switch logic passed local automated
tests; the owner previously confirmed local UI behavior. Live history and sessions
were verified over HTTP, not by browser automation. Before presenting, open the
site in two browser profiles and exchange one emoji/multiline message, reload the
conversation and use Load older messages.

No unrelated features or infrastructure were introduced. Broader authentication
rate limiting, monitoring and public-commercial-launch hardening remain deferred.
