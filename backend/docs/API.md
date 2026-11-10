# API reference

All routes are under `/api`. Unless marked public, a route requires the `sdn.sid` session cookie. Success responses use JSON; error responses use `{ "error": { "code": "...", "message": "..." } }`. Validation errors may include a `details` object keyed by field name. In examples, `"<ISO timestamp>"` denotes the runtime-generated ISO 8601 timestamp.

## Health

### `GET /api/health`

- **Auth:** Public
- **Body:** None
- **Success:** `200`

  ```json
  { "data": { "status": "ok", "database": "up" } }
  ```

- **Errors:** `503 SERVICE_UNAVAILABLE`

## Authentication

### `POST /api/auth/register`

- **Auth:** Public
- **Body:** `{ "displayName": "Example User", "email": "example@example.com", "password": "password-123" }`
- **Success:** `201`

  ```json
  {
    "data": { "id": 1, "displayName": "Example User", "email": "example@example.com" },
    "message": "Registration successful. Please log in."
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`

### `POST /api/auth/login`

- **Auth:** Public
- **Body:** `{ "email": "example@example.com", "password": "password-123" }`
- **Success:** `200`, sets the `sdn.sid` cookie

  ```json
  {
    "data": { "id": 1, "displayName": "Example User", "email": "example@example.com" },
    "message": "Logged in successfully."
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS`

### `POST /api/auth/logout`

- **Auth:** Session
- **Body:** None
- **Success:** `200`

  ```json
  { "message": "Logged out." }
  ```

- **Errors:** `401 UNAUTHENTICATED`

### `GET /api/auth/me`

- **Auth:** Session
- **Body:** None
- **Success:** `200`

  ```json
  { "data": { "id": 1, "displayName": "Example User", "email": "example@example.com" } }
  ```

- **Errors:** `401 UNAUTHENTICATED`

## Profile

### `GET /api/profile/me`

- **Auth:** Session
- **Body:** None
- **Success:** `200`

  ```json
  {
    "data": {
      "userId": 1,
      "displayName": "Example User",
      "email": "example@example.com",
      "bio": null,
      "experienceLevel": null,
      "interests": null,
      "githubUrl": null,
      "portfolioUrl": null,
      "isComplete": false,
      "createdAt": "<ISO timestamp>",
      "updatedAt": "<ISO timestamp>"
    }
  }
  ```

- **Errors:** `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`

### `PUT /api/profile/me`

- **Auth:** Session
- **Body:** `{ "displayName": "Example User", "bio": "I build web apps.", "experienceLevel": "intermediate", "interests": "APIs", "githubUrl": "https://github.com/example", "portfolioUrl": null }`. Omitted optional fields become `null`.
- **Success:** `200`

  ```json
  {
    "data": {
      "userId": 1,
      "displayName": "Example User",
      "email": "example@example.com",
      "bio": "I build web apps.",
      "experienceLevel": "intermediate",
      "interests": "APIs",
      "githubUrl": "https://github.com/example",
      "portfolioUrl": null,
      "isComplete": true,
      "createdAt": "<ISO timestamp>",
      "updatedAt": "<ISO timestamp>"
    },
    "message": "Profile updated."
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`

## Skills

`Skill` is `{ "id": 1, "name": "JavaScript" }`.

### `GET /api/skills`

- **Auth:** Session
- **Body:** None
- **Success:** `200 { "data": [{ "id": 1, "name": "JavaScript" }] }`
- **Errors:** `401 UNAUTHENTICATED`

### `GET /api/skills/me`

- **Auth:** Session
- **Body:** None
- **Success:** `200 { "data": { "offered": [], "wanted": [] } }`
- **Errors:** `401 UNAUTHENTICATED`

### `POST /api/skills/me/offered` and `POST /api/skills/me/wanted`

- **Auth:** Session
- **Body:** `{ "skillId": 1 }`
- **Success:** `201 { "data": { "id": 1, "name": "JavaScript" }, "message": "Skill added." }`
- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 SKILL_NOT_FOUND`, `409 SKILL_ALREADY_ADDED`

### `DELETE /api/skills/me/offered/:skillId` and `DELETE /api/skills/me/wanted/:skillId`

- **Auth:** Session
- **Body:** None
- **Success:** `200 { "message": "Skill removed." }`
- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 SKILL_NOT_ASSIGNED`

## Developer discovery

### `GET /api/developers`

- **Auth:** Session
- **Query:** `search` (literal case-insensitive substring), `page` (default 1), `limit` (default 12, maximum 50)
- **Body:** None
- **Success:** `200`

  ```json
  {
    "data": [{
      "id": 2,
      "displayName": "Other Developer",
      "bio": null,
      "experienceLevel": null,
      "offeredSkills": [],
      "wantedSkills": [],
      "connection": null
    }],
    "meta": { "page": 1, "limit": 12, "total": 1 }
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`

### `GET /api/developers/:id`

- **Auth:** Session
- **Body:** None
- **Success:** `200`, a `DeveloperSummary` plus `interests`, `githubUrl`, and `portfolioUrl`

  ```json
  {
    "data": {
      "id": 2,
      "displayName": "Other Developer",
      "bio": null,
      "experienceLevel": null,
      "offeredSkills": [],
      "wantedSkills": [],
      "connection": null,
      "interests": null,
      "githubUrl": null,
      "portfolioUrl": null
    }
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`

## Matching

### `GET /api/matches`

- **Auth:** Session
- **Query:** `limit` (default 20, maximum 50)
- **Body:** None
- **Success:** `200`

  ```json
  {
    "data": [{
      "developer": { "id": 2, "displayName": "Other Developer", "bio": null, "experienceLevel": null },
      "score": 100,
      "matchType": "mutual",
      "theyOfferYouWant": [{ "id": 2, "name": "Python" }],
      "youOfferTheyWant": [{ "id": 1, "name": "React" }],
      "explanation": "Mutual match: they offer Python, which you want, and you offer React, which they want.",
      "connection": null
    }],
    "meta": { "count": 1, "hasOfferedSkills": true, "hasWantedSkills": true }
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`

## Collaboration requests

`Request` is `{ id, status, message, direction, counterpart: { id, displayName }, createdAt, updatedAt }`.

### `POST /api/requests`

- **Auth:** Session
- **Body:** `{ "recipientId": 2, "message": "Let us collaborate." }`; `message` is optional
- **Success:** `201`

  ```json
  {
    "data": {
      "id": 1,
      "status": "pending",
      "message": "Let us collaborate.",
      "direction": "outgoing",
      "counterpart": { "id": 2, "displayName": "Recipient User" },
      "createdAt": "<ISO timestamp>",
      "updatedAt": "<ISO timestamp>"
    },
    "message": "Collaboration request sent."
  }
  ```

- **Errors:** `400 VALIDATION_ERROR`, `400 SELF_REQUEST`, `401 UNAUTHENTICATED`, `404 USER_NOT_FOUND`, `409 DUPLICATE_REQUEST`

### `GET /api/requests/incoming` and `GET /api/requests/outgoing`

- **Auth:** Session
- **Query:** Optional `status=pending`, `status=accepted`, or `status=rejected`
- **Body:** None
- **Success:** `200 { "data": [] }` when no requests match. A row includes its `direction`, `counterpart`, `createdAt`, and `updatedAt`; results are newest first.
- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`

### `POST /api/requests/:id/accept`

- **Auth:** Session; caller must be the recipient
- **Body:** None
- **Success:** `200`, updated request data as shown for request creation, with `"status": "accepted"` and `"message": "Request accepted."`
- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 REQUEST_NOT_FOUND`, `409 INVALID_STATE`

### `POST /api/requests/:id/reject`

- **Auth:** Session; caller must be the recipient
- **Body:** None
- **Success:** `200`, updated request data as shown for request creation, with `"status": "rejected"` and `"message": "Request rejected."`
- **Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHENTICATED`, `403 FORBIDDEN`, `404 REQUEST_NOT_FOUND`, `409 INVALID_STATE`

## Private messaging

Requires migration `003_private_messaging.sql`. All endpoints require a session;
all responses from the conversations router set `Cache-Control: no-store`.
Only the two participants in an accepted request can use its conversation.
Nonparticipants receive the same `404` response as an unknown identifier.

See [messaging API usage](MESSAGING_API.md) for pagination, retry, and polling rules.

| Method and path | Input | Success |
|---|---|---|
| `GET /api/conversations/csrf-token` | None | `200 { data: { csrfToken, userId } }` |
| `POST /api/conversations` | `{ requestId }`, JSON and CSRF header | `201 { data: Conversation }` when created; `200` when already present |
| `GET /api/conversations` | `page` (default 1, max 10,000), `limit` (default 20, max 50) | `200 { data: Conversation[], meta: { page, limit, hasMore } }` |
| `GET /api/conversations/:id` | Positive integer conversation ID | `200 { data: Conversation }` |
| `GET /api/conversations/:id/messages` | Optional `before` or `after` message ID string; `limit` default 30, max 100 | `200 { data: Message[], meta: { limit, hasMore, nextBefore, nextAfter } }` |
| `POST /api/conversations/:id/messages` | `{ body, clientMessageId }`, JSON and CSRF header | `201 { data: Message, meta: { replayed: false } }`; identical retry returns `200` and `replayed: true` |

`Conversation` is `{ id, requestId, counterpart: { id, displayName }, createdAt, lastMessage }`.
`lastMessage` is a `Message` or `null`. Conversations are ordered by latest activity,
then conversation ID descending. Only opened conversations appear in the inbox.

`Message` is `{ id, conversationId, senderId, clientMessageId, body, createdAt }`.
Message IDs are decimal **strings**, including in cursors; conversation/request/user
IDs are JSON integers. Timestamps are ISO strings. The sender always comes from
the server session. Unknown body fields (such as `senderId` or `createdAt`) are
rejected. Text is trimmed, must contain 1–2,000 Unicode code points, and cannot
contain NUL or unpaired surrogates. The UUID is required and normalized to lowercase.

Both POST endpoints require `Content-Type: application/json` and `X-CSRF-Token`
from the authenticated token endpoint. Tokens belong to one login session and
change when login regenerates that session. This protection is scoped to messaging;
it does not change the existing auth/profile/skills/request API contracts.

Messaging errors:

- `400 VALIDATION_ERROR`: invalid fields, IDs, pagination, Unicode, or cursor combinations
- `401 UNAUTHENTICATED`: missing, logged-out, or expired session
- `403 CSRF_INVALID`: absent, invalid, or other-session CSRF token
- `404 CONNECTION_NOT_FOUND` / `CONVERSATION_NOT_FOUND`: missing or inaccessible resource
- `409 CONNECTION_NOT_ACCEPTED`: the caller's collaboration request is pending or rejected
- `409 MESSAGE_ID_REUSED`: this sender reused the UUID in this conversation with different text
- `413 PAYLOAD_TOO_LARGE`: the JSON request exceeds the existing 10 KB body limit
- `415 UNSUPPORTED_MEDIA_TYPE`: a messaging POST is not JSON
- `429 MESSAGE_RATE_LIMITED`: 30 new messages per sender in the preceding 60 seconds; includes `Retry-After` seconds
- `503 MESSAGING_BUSY`: lock timeout, statement timeout, or deadlock; includes `Retry-After: 1`

## Common errors

- `400 VALIDATION_ERROR`: malformed JSON, invalid body, path id, or query
- `401 UNAUTHENTICATED`: missing or invalid session
- `404 NOT_FOUND`: unknown route
- `413 PAYLOAD_TOO_LARGE`: request body exceeds the configured JSON limit
- `500 INTERNAL_ERROR`: unexpected server failure; internal details are not included in the response
