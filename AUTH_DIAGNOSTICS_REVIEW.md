# Authentication diagnostics and recovery — local review

Branch: `investigation/login-429-error`.
Production base before this release: `223058cdb871eacbe296c11ee090b756fdc3a4da`.
The implementation stage was local only. The owner subsequently completed manual review and authorized committing, merging, and deploying these changes. This document records the implementation and test evidence; deployment results are reported separately for the final release commit.

## Behavior

- A successful initial session check retains normal authentication behavior.
- HTTP 401 confirms the signed-out state and allows normal login/registration routing.
- HTTP 429, 5xx, network failures, and other unsuccessful checks show a single recovery view. Protected components and their polling do not mount until authentication is resolved. Temporary failure does not call logout, clear cookies, or declare the session invalid.
- Retry is user initiated. A synchronous in-flight guard prevents overlapping checks. Rerenders do not initiate another session request. A stalled check is aborted after 30 seconds and shows recovery.
- Numeric and HTTP-date Retry-After values control the Retry button. Missing or invalid values add no invented waiting period. Expiration never sends a request automatically.
- Manual login retains its duplicate-submit guard and blocks another submission until a supplied 429 cooldown expires. It does not automatically resubmit credentials.
- Recovery uses existing design tokens, a focused heading, a polite status message, and native keyboard-accessible buttons. Countdown text is not announced every second. Timers and outstanding session checks are cleaned up on unmount.
- Password hashing, database TLS, session storage/lifetime/cookies, CSRF checks, administrator permissions, API endpoints, and production proxy configuration are unchanged. No rate limiter was added.

## Diagnostics

Only GET `/api/auth/me` and POST `/api/auth/login` are observed. The middleware runs before HTTPS enforcement, JSON parsing, and session middleware, allowing their rejection outcomes to be recorded too.

Each request gets a generated UUID in `X-SDN-Auth-Request-Id`. Caller-supplied IDs are ignored; provider identifiers are not overwritten. The header is exposed through the existing CORS policy without changing allowed origins or credentials. It survives the local Vite proxy. No caching directives are changed.

Two structured records normally appear: `auth_request_received` and `auth_request_completed`. Records contain UTC timestamp, fixed method/route, generated correlation ID, and `expressProcessed: true`. Completion adds HTTP status and duration in milliseconds. A disconnected response can instead produce `auth_request_aborted` with null status.

These records never copy request bodies, query strings, cookies, session identifiers, passwords, email addresses, authorization headers, client IPs, evidence links, or arbitrary headers. Logging errors are caught and cannot interrupt the authentication response. The existing unrelated error logger has not been redesigned.

## Files

Modified:

- `backend/src/app.js`
- `backend/src/utils/logger.js`
- `frontend/package.json`
- `frontend/package-lock.json`
- `frontend/src/api/auth.api.js`
- `frontend/src/api/client.js`
- `frontend/src/context/AuthContext.jsx`
- `frontend/src/pages/LoginPage.jsx`
- `frontend/tests/client.test.mjs`

Added:

- `backend/src/middleware/authDiagnostics.js`
- `backend/tests/unit/authDiagnostics.test.js`
- `frontend/src/hooks/useRetryCooldown.js`
- `frontend/src/components/layout/SessionRecovery.jsx`
- `frontend/src/components/layout/SessionRecovery.css`
- `frontend/tests/auth-recovery.test.mjs`
- `frontend/tests/support/jsx-loader.mjs`
- `frontend/scripts/auth-recovery-preview.mjs`
- `AUTH_DIAGNOSTICS_REVIEW.md`

The test-only dependencies are jsdom 26 and an explicit declaration of the esbuild transformer already used by Vite. They are not application runtime dependencies. Existing unrelated untracked backup files and the docs directory were preserved.

## Verification results

- Complete backend suite: 125 passed, 0 failed, using PostgreSQL on loopback port 55442 and `sdn_verification_20261119_test` only.
- Complete frontend suite: 80 passed, 0 failed. Includes actual React DOM tests for recovery, gating, 401/429/500/network outcomes, timeout, retry success, duplicate clicks, login cooldowns, unmount, and fresh account state.
- Frontend production build: passed. Checked that the local simulation script is absent from the production bundle.
- General frontend API → Vite proxy → Express → local PostgreSQL integration: all 8 groups passed (registration, login, sessions, profiles, skills, discovery/matching, collaboration, logout).
- Messaging integration: passed, including automatic receipt, emoji/multiline persistence, idempotency, pause/resume, expired sessions, and short/35-message history after account switching.
- Notification integration: passed, including request outcomes, polling, aggregation, read/clear actions, privacy, and account switching.
- Verification integration: passed, including submission, reviewer authorization, rejection/resubmission, approval, revocation, historical events, badges, notifications, and logout protection.
- Local health: 200; anonymous session endpoint: 401 with the new correlation header. CORS exposes Retry-After and the application correlation header.
- `git diff --check`: passed.

The first general integration run lacked enough skill catalogue fixtures after the backend suite reset its local test data. The existing guarded test-only seed populated the catalogue; the repeated integration run passed. No application change was needed for that fixture issue.

The first build attempt hit a filesystem sandbox restriction. The same build passed with authorized filesystem access. Automated tests ran on Node 24.16; the chosen test dependencies support the project's Node 20 baseline, but a separate Node 20 execution was not performed.

No real mobile/browser visual review or production verification was performed by the implementation agent. The owner subsequently confirmed successful manual review, including the simulated 429 recovery flow. Simulated failures do not establish the real production cause.

## Manual review

The local API is running on `http://127.0.0.1:4108`, against the isolated test database. The preview is running on `http://127.0.0.1:5180` and proxies only to that API. Production credentials/accounts are not needed; register a local demonstration account if desired.

1. Open `http://127.0.0.1:5180/login`. Confirm normal registration/login and logout.
2. Log in locally, then open `http://127.0.0.1:5180/dashboard?sessionDemo=429`.
3. Confirm the recovery message appears and no dashboard content is visible. Retry is disabled for the simulated five-second Retry-After period.
4. Wait five seconds: no request is automatically sent. Activate Retry. It now calls the real local API; the existing session should restore the dashboard.
5. Repeat with `sessionDemo=500` and `sessionDemo=network`. Retry should be immediately available, with the same recovery behavior.
6. Repeat while signed out. After Retry receives the real 401, normal login routing should appear.
7. Check narrow/mobile emulation, Tab navigation, visible focus, and the recovery status message. In Network, check one initial `/api/auth/me` and one request per deliberate retry; the simulated first failure is returned in memory and therefore is not a real network entry. Administrator routes may perform their existing additional role-validation check.
8. Use the automated login cooldown tests for simulated POST 429 behavior; the manual preview fixture only intercepts the initial session GET and never fakes login success.

The fixture injects one failure per page load only when started through `node scripts/auth-recovery-preview.mjs` from `frontend`. Normal `npm run dev` and production builds do not inject it. To restart the backend, use the protected local test runtime settings, not the repository's hosted database configuration. Do not run tests against production.

## Production evidence after the approved release

During a natural failure, capture timestamp/timezone, method, hostname, path without query parameters, status, Content-Type, Retry-After, `X-SDN-Auth-Request-Id`, `x-vercel-id`, `rndr-id`, and `cf-ray` when present. Capture a sanitized response excerpt, excluding cookies, authorization, passwords, account identifiers and other private data.

Search Render application logs for the exact application correlation ID. Check matching Vercel firewall/request events and Render request logs using provider IDs where available.

- A matching completed log with status 429 establishes that Express completed that response with 429.
- A matching completed log with another status while the client sees 429 suggests a later layer altered the response; correlate provider records before attributing it.
- A received record without completion warrants investigation of disconnects, process interruption, and log loss.
- Missing application headers/logs alone do not prove upstream rejection: the deployed version, proxy header preservation, logging availability, and retention must also be verified.

The generated application ID identifies a request, not a user. It intentionally cannot diagnose carrier IP sharing by itself. The release brief reports prior browser evidence of `X-Render-Routing: hibernate-rate-limited`, strongly indicating a Render routing restriction for that response. This release does not remove that restriction, change hosting plans, or change provider security controls. Requests rejected before Express cannot generate these application diagnostic records.
