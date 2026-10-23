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

## Common errors

- `400 VALIDATION_ERROR`: malformed JSON, invalid body, path id, or query
- `401 UNAUTHENTICATED`: missing or invalid session
- `404 NOT_FOUND`: unknown route
- `500 INTERNAL_ERROR`: unexpected server failure; internal details are not included in the response
