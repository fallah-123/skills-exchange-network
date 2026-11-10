# Private messaging API — step 3

The backend API, frontend interface, and frontend polling loop are implemented.
Supabase migration and deployment remain pending until release. Read the
endpoint and error reference in [API.md](API.md#private-messaging) and the schema
contract in [MESSAGING_STORAGE.md](MESSAGING_STORAGE.md).

## Client sequence

1. Log in through the existing session-cookie flow. Include credentials in Fetch.
2. Request `GET /api/conversations/csrf-token` and retain the returned token in
   memory for this login session. The response also contains `userId`; the frontend
   checks it against the active account before posting, including when refreshing
   an expired token. Send the token as `X-CSRF-Token` on messaging POSTs.
3. Open an accepted connection using `POST /api/conversations` with
   `{ "requestId": 12 }`. Both participants receive the same conversation ID;
   an existing conversation returns 200 and a new one returns 201.
4. Load the inbox with `GET /api/conversations?page=1&limit=20`. A conversation
   includes the counterpart and latest message preview. The inbox lists opened
   conversations, ordered by latest activity. Its numbered pages may shift as
   activity changes; refresh from page one when refreshing the inbox.
5. Load the conversation header with `GET /api/conversations/:id` and its recent
   history with `GET /api/conversations/:id/messages?limit=30`.
6. Generate a UUID once per composed send (`crypto.randomUUID()` in a secure
   browser context). Send JSON `{ "body": "Hello", "clientMessageId": "<UUID>" }`.
   Keep that UUID and text for every retry of this send, including after network
   failures or a retryable server response. Only a new logical send gets a new UUID.

All reads and writes check the session user's membership. The browser must never
choose a sender ID, creation timestamp, or message ID. Render message bodies as
text. Never store the CSRF token in URLs or logs.

## History and incremental polling contract

Messages in every response are ordered oldest-to-newest by bigint ID. Keep IDs
as strings; do not convert them to JavaScript numbers.

- With no cursor, the endpoint returns the latest page. Save `meta.nextAfter` as
  the initial polling cursor (`"0"` for an empty conversation).
- To load older history, use `before=meta.nextBefore`. When there is no older page,
  `nextBefore` is null. Older-page responses deliberately return `nextAfter: null`
  so loading old history cannot reset the polling cursor.
- To receive newer messages, use `after=<saved polling cursor>`. New messages are
  returned in ascending ID order. Update the cursor to `meta.nextAfter` **only after
  merging this response**. Empty results retain the supplied cursor.
- If an `after` response has `hasMore: true`, fetch the next page using its
  `nextAfter` before returning to the normal polling interval. Do not jump to the
  newest message or skip the middle pages.
- Do not advance the polling cursor from a send response: another participant's
  messages may have arrived since the last read. Merge sends/history by message
  ID and use `clientMessageId` to reconcile a pending local send.
- Only one of `before` and `after` may be supplied. `after=0` is allowed for an
  initial forward scan; `before` must be positive. Cursors are bounded by the
  signed PostgreSQL bigint maximum.

For writes, the server locks the conversation **before** allocating the identity
value and holds that lock until commit. Thus messages sent through the API cannot
commit out of order within a conversation and escape the polling cursor. Other
database writers must follow this same ordering rule.

## Retries, concurrency, and limits

A retry looks up `(conversation_id, sender_id, client_message_id)` after locking
the conversation. An identical normalized body returns the original record with
200 and `meta.replayed: true`. A changed body produces 409 `MESSAGE_ID_REUSED`.
Two independent sessions retrying simultaneously still create only one message.

Send protection allows 30 newly saved messages per sender in a sliding 60-second
window across all conversations, sessions, and backend instances. A transaction
advisory lock serializes the sender's allowance check; the indexed database query
counts recent saved messages. The sender/time index in the unreleased migration
003 was extended to support this query. No in-memory counters or new service are
required. Identical retries bypass the allowance, while other participants retain
their own independent allowance. A 429 includes a `Retry-After` header in seconds.

Messaging write transactions use a five-second lock timeout and a ten-second
statement timeout. Transient lock/deadlock failures roll back and return
503 `MESSAGING_BUSY` with `Retry-After: 1`. Retry the same UUID and text after the
indicated delay. Do not blindly retry validation, access, or changed-body errors.

## Session and privacy behavior

The CSRF token is an HMAC of the session ID with a messaging-specific purpose and
the existing session secret. It does not require competing session mutations
across tabs. It stays stable within a session and changes when login regenerates
the session. Fetch a fresh token after login or `CSRF_INVALID`; a 401 requires
reauthentication. Logged-out and expired sessions cannot access messaging.

Responses use `Cache-Control: no-store`. CORS permits the token header and exposes
`Retry-After` under the existing configured origin policy. Supabase client roles remain blocked from
the new tables; the Express API enforces participant access over its owner
connection. The new protections apply to messaging and do not claim to harden all
existing application endpoints.

## Testing and release prerequisites

`tests/api/messaging.test.js` exercises the real HTTP routes, session cookies,
PostgreSQL storage, participant checks, CSRF, input limits, cursor pagination,
idempotent retries, cross-session rate limits, concurrent send ordering, and lock
timeouts. `tests/unit/messaging.validator.test.js` covers Unicode and bigint/query
boundaries. Run the complete backend suite against a guarded isolated test DB.

Before release, apply migration 003, verify the deployed backend points to the
intended Supabase database, use HTTPS and verified database TLS, and deploy the
frontend with the documented CSRF/retry/pagination handling. These routes require
the new tables even though the existing app pages can still run without them.

## Step 3 verification results

The full backend suite passed all 70 tests with no skips against an isolated local
PostgreSQL 17 database. This includes the existing 48 tests plus 18 messaging HTTP
tests and four messaging validation tests. The test database reproduced Supabase
API roles and broad default grants; the existing privacy tests also passed.

HTTP tests verified session expiry/logout, session-bound CSRF, participant access,
Unicode and bigint boundaries, inbox/history pagination, concurrent conversation
creation, retry deduplication, a global sender allowance across sessions and
conversations, chronological commit ordering, and safe lock-timeout responses.
The CORS check also verifies that browser clients can read `Retry-After`.

No application `.env` changes, Supabase migration, or deployment were performed.
Step 3 implements the backend only; the next step is the messaging interface.
