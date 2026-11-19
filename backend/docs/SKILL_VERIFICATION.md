# Evidence-based skill verification V1

Local implementation on `feature/skill-verification`. Production release is not authorized.

## Product and architecture

Verification is optional and applies to offered skills only. Registration, matching, collaboration and messaging remain available without verification. The **Evidence Reviewed** badge means supporting evidence was reviewed; it does not certify identity, authorship or independently tested proficiency.

The existing React application and Express routes/controllers/services/repositories are extended. Login, Argon2 password hashing, Express sessions, PostgreSQL TLS, cookies and the Vercel proxy are unchanged. No dependencies were added. The matching algorithm and scores are unchanged; badge metadata is added separately and belongs to a specific developer and offered skill.

Developers can submit 1–3 HTTPS links (up to 1,000 characters each), descriptions (1–300 characters), and a personal contribution (50–1,500 characters). The request body has a 9,500-byte limit. Duplicate links, embedded credentials, non-default ports, IP literals and common local/private hostnames are rejected. All IP literals are rejected rather than attempting an incomplete private-address allowlist. The service never fetches, clones, executes or embeds evidence. Reviewers inspect links manually; custom DNS names and redirects cannot be certified safe by syntax validation alone.

One pending or approved request may exist per developer/skill. New attempts preserve prior evidence and history. Supported transitions are pending → approved/rejected/withdrawn and approved → revoked or withdrawn upon offered-skill removal. Re-adding a removed skill does not restore its badge. Unverified is derived. A submission limit of ten per developer per hour bounds repeated writes.

## Administration and privacy

New and existing accounts default to `developer`; only an operator can grant `admin`. Registration/profile fields cannot elevate roles. Administrators use the existing login and session. Every admin API request reads the current database role; decision transactions recheck and lock that role. Self-review is prohibited. Mutations require session-bound CSRF tokens. Evidence and history are visible only to the applicant or authorized reviewers; public skill responses contain badge metadata only.

The review dashboard provides a paginated pending/history queue, status filtering, evidence and previous attempts, five review criteria, feedback, approval, rejection and revocation. Approval requires all five criteria and feedback. Rejection requires feedback; revocation requires a reason. Version checks, row locks, conditional updates and a partial unique index prevent conflicting decisions. Review status, immutable event and notification commit together.

Provisioning is a CLI operation with exact target, account ID, email and explicit confirmation checks. It invalidates only the selected account's sessions and requires a new login. No preview or production administrator has been created or promoted. Automated tests use disposable administrator fixtures exclusively in the isolated test database.

## Database changes

`005_skill_verification.sql` adds `users.role` and:

- `skill_verification_requests`: immutable applicant/skill/contribution, versioned status, feedback/rubric, timestamps and restrictive foreign keys.
- `skill_verification_evidence`: 1–3 immutable links/descriptions, ordered composite primary key and per-request URL uniqueness.
- `skill_verification_events`: append-only actor, action, request version, rubric, feedback and timestamp.
- Active-request uniqueness, owner/history/queue/skill/event-actor indexes, transition and audit guards, deferred submission-completeness guard, and offered-skill deletion retirement trigger.
- RLS with no client policies and explicit revocation of public and existing Supabase API-role privileges on new objects. The backend continues using its existing database connection.

`006_verification_notifications.sql` adds the nullable event reference to notifications, extends type/reference constraints, adds recipient/event uniqueness and updates the notification guard. It references immutable review events, so old approval notices remain valid after revocation. Existing messaging and collaboration rows remain valid.

The guarded migration command validates configured and connected targets, checks prerequisites 001–004, refuses partial/repeated application, applies 005/006 in one transaction and runs readiness before committing. The local rehearsal verifies preservation of all nine existing application tables and the default-grant restrictions. It retains its newly created rehearsal database; it never resets an existing database.

## API and notification compatibility

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/verifications/csrf-token` | Current session token |
| GET | `/api/verifications/me` | Applicant's paginated attempts |
| POST | `/api/verifications` | Submit own offered skill |
| GET | `/api/verifications/:id` | Own evidence/history |
| POST | `/api/verifications/:id/withdraw` | Withdraw own pending request |
| GET | `/api/admin/verifications` | Reviewer queue/history |
| GET | `/api/admin/verifications/:id` | Reviewer evidence/history |
| POST | `/api/admin/verifications/:id/decision` | Approve/reject with version |
| POST | `/api/admin/verifications/:id/revoke` | Revoke with version/reason |

New notifications are `verification_approved`, `verification_rejected` and `verification_revoked`; submission itself sends none. The updated frontend sends `X-Notification-Version: 2`. Legacy clients omit the header and see only existing types. Their unread counts and all read/clear operations use that same scope, so they cannot accidentally clear hidden verification notices. Existing grouping, polling, account isolation and message-version protection remain in place.

## Local preview on this computer

Preview: **http://127.0.0.1:5179/**. Backend: port **4108**. Integration tests use separate ports **5178/4107** and a separate database.

The isolated PostgreSQL 17 cluster and credentials live outside the repository in a protected temporary directory. `%TEMP%\sdn-verification-local.json` contains only the path to its protected runtime configuration. Do not print or copy the runtime file. The current loopback database port is **55442**. No existing `.env` credentials were changed. This setup is temporary and machine-specific; if removed, stop and prepare another isolated cluster rather than falling back to the hosted database.

If PostgreSQL has stopped, use this PowerShell command to start only the prepared local cluster (no secret output):

```powershell
$state = Get-Content -Raw "$env:TEMP\sdn-verification-local.json" | ConvertFrom-Json
$runtime = Get-Content -Raw -LiteralPath $state.runtimeFile | ConvertFrom-Json
$clusterData = Join-Path $runtime.root 'data'
& (Join-Path $runtime.bin 'pg_ctl.exe') -D $clusterData -l (Join-Path $runtime.root 'server.log') -o "-h 127.0.0.1 -p $($runtime.port)" -w start
```

Start these in separate terminals if the preview servers have stopped:

```powershell
# From backend
node scripts/local-verification.js preview
```

```powershell
# From frontend
$env:API_PROXY_TARGET='http://127.0.0.1:4108'
npm.cmd run dev -- --host 127.0.0.1 --port 5179 --strictPort
```

Leave `VITE_API_URL` unset. The wrapper fixes the target to the protected local runtime, uses a separate preview database and preserves a stable local session secret. The preview contains the skill catalogue; create your own disposable accounts through registration.

## Dedicated local administrator — operator action after approval

1. Register a separate reviewer account in the local preview. It starts as a normal developer.
2. While logged in, inspect the `/api/auth/me` response in browser Developer Tools → Network and record only its numeric account ID. Keep its password private.
3. From `backend`, run the dry-run below with that account's exact ID and email. It makes no changes:

```powershell
node scripts/local-verification.js provision --user-id YOUR_ID --expected-email YOUR_LOCAL_EMAIL
```

4. After confirming the account selection, explicitly apply:

```powershell
node scripts/local-verification.js provision --user-id YOUR_ID --expected-email YOUR_LOCAL_EMAIL --apply --confirm-user-id YOUR_ID
```

5. Log in again. Existing sessions for that account were invalidated. Open **Review dashboard** → `/admin/verifications`. Use a different developer account to submit evidence. No HTTP endpoint can grant this role.

Do not run the provisioning command against a production account under this implementation approval.

## Manual review checklist

1. Register a developer, add an offered skill, submit one to three links and a meaningful contribution; verify pending status/history. Wanted-only skills must be unavailable.
2. As the separate reviewer, inspect evidence, complete all criteria, enter feedback and approve. Confirm the applicant sees the badge and approval notification, including after reload/login.
3. Check badge placement in skills, developer profile/discovery and matching, and verify another developer with the same skill has no badge.
4. Reject a second submission with feedback, inspect that feedback as applicant, and resubmit. Confirm both attempts remain accessible.
5. Revoke an approval with a reason. Confirm the badge disappears, a new notice arrives and the original decision remains in history.
6. Remove a pending/approved offered skill using the confirmation dialog. Re-add it; confirm a new submission is required. Unverified skill removal should retain its normal behavior.
7. Withdraw a pending request. Try a duplicate active request, invalid URLs, blank/long explanations and another user's evidence URL. Confirm useful errors and privacy.
8. Verify keyboard focus, Escape/cancel behavior, screen-reader labels, narrow/mobile layouts, loading/error/retry states and long links. Check admin routes as a developer and self-review restrictions.
9. Exercise existing profiles, skills, matching, collaboration, messaging (including emoji/multiline/history), notifications, account switching and logout.

Browser automation was unavailable during implementation. Rendered appearance, responsive layouts and real keyboard/screen-reader interaction require this manual review; automated API tests and a successful build do not substitute for it.

## Repeatable local checks

From `backend`, use `node scripts/local-verification.js test` for the full suite, `check` for preview readiness and `rehearsal` for a fresh isolated migration rehearsal. **The suite resets only its designated disposable test database. Never run it while integration tests are using that database.** It does not reset the preview database.

After the backend suite, run `node scripts/local-verification.js seed-test` to restore the 12-entry catalogue required by existing integration checks. Start `node scripts/local-verification.js integration`, then run Vite in another terminal using proxy target `http://127.0.0.1:4107` and port `5178`.

From `frontend`:

```powershell
npm.cmd test
npm.cmd run build
$env:INTEGRATION_TARGET_IS_TEST_DB='yes'
$env:INTEGRATION_ORIGIN='http://127.0.0.1:5178'
npm.cmd run check:verification
npm.cmd run check:integration
npm.cmd run check:messaging
npm.cmd run check:notifications
```

The verification integration check uses the backend suite's disposable reviewer fixture, creates disposable applicant records, and never provisions an administrator. These commands are not production checks.

## Future release boundary

Nothing was pushed or deployed. Future release requires separate approval: review/commit the feature, verify the hosted target and current migration state, apply guarded 005/006, deploy the compatible backend before the new frontend, run readiness and authentication checks, then explicitly provision the intended dedicated administrator. Older notification clients remain supported during that transition. Keep the current TLS/session settings, Vercel proxy and unset `VITE_API_URL`.

No destructive down migration is provided: rolling back by deleting verification tables would destroy evidence/history. If a future release fails, stop and assess a forward fix while retaining database records.

## Executed verification — 19 November 2026

| Check | Result |
|---|---|
| Complete backend suite | 121 passed, 0 failed, 0 skipped |
| Complete frontend unit/API suite | 60 passed, 0 failed, 0 skipped |
| Guarded migration rehearsal | Passed: preflight, 005/006, repeat refusal, nine-table preservation, grants and readiness |
| Preview database readiness | Passed |
| Frontend verification integration | Passed: submit/queue/reject/resubmit/approve/revoke/badges/history/notifications/removal/logout |
| Existing application integration | 8 groups passed |
| Messaging integration | Passed, including Unicode/multiline, polling, account switching and all 35 history messages |
| Notification integration | Passed, including real polling, grouping, private ownership and all clearing operations |
| Frontend production build | Passed, 156 modules |
| Local preview and proxied health | Both HTTP 200; preview has 12 skills, 0 users and 0 administrators before manual review |
| Rendered UI, responsive and keyboard checks | Not performed: browser access host unavailable; manual checklist above |

The first resumed runs encountered stopped local services; Windows also refused the old PostgreSQL port. The same isolated cluster restarted on port 55442 without resetting data. One intermediate integration run lacked its catalogue after the backend fixture reset; seeding the test-only catalogue restored its documented prerequisite, and all eight groups then passed. These were local test-environment issues, not production checks or production changes.
