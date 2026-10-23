# Skills Exchange Network backend

An Express and PostgreSQL JSON API for account sessions, developer profiles, skill lists, developer discovery, exact skill-id matching, and collaboration requests. The backend uses the owner-managed PostgreSQL schema and does not seed the real database.

## Requirements

- Node.js 20 or newer
- PostgreSQL 14 or newer
- The application database with migration `001_initial_schema.sql` already applied

## Local setup

1. Install dependencies:

   ```powershell
   cd backend
   npm.cmd install
   ```

2. Copy `.env.example` to `.env` and fill in the local PostgreSQL connection values and a private session secret. Keep `.env` out of source control.
3. In pgAdmin, run the contents of `002_session_table.sql` once against the application database. The session store requires its `user_sessions` table.
4. Check the existing schema without writing to it:

   ```powershell
   npm.cmd run check:db
   ```

5. Start the local development server:

   ```powershell
   npm.cmd run dev
   ```

The API is available at `http://localhost:4000/api` by default. The frontend can proxy `/api` to this local server; CORS is not enabled.

## Environment

| Variable | Purpose | Example |
|---|---|---|
| `NODE_ENV` | `development`, `test`, or `production` | `development` |
| `PORT` | HTTP listening port | `4000` |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5433` |
| `DB_NAME` | Existing application database | `postgres` |
| `DB_USER` | PostgreSQL user | `postgres` |
| `DB_PASSWORD` | PostgreSQL password | Set locally; do not commit |
| `DB_NAME_TEST` | Isolated test database, must differ from `DB_NAME` and end in `_test` | `sdn_test` |
| `SESSION_SECRET` | Session signing secret, at least 32 characters | Set locally; do not commit |

When `NODE_ENV=test`, the pool uses `DB_NAME_TEST`. Configuration validation fails before startup if required settings are missing or invalid.

## Commands

| Command | Purpose |
|---|---|
| `npm start` | Start the backend |
| `npm run dev` | Start with Node's built-in watch mode |
| `npm run check:db` | Read-only validation of expected tables and triggers in `DB_NAME` |
| `npm run db:test:setup` | Create or recreate the safety-checked `_test` database and apply local migrations |
| `npm run db:test:seed-skills` | Idempotently seed the synthetic skill catalogue in `DB_NAME_TEST` only |
| `npm run dev:test` | Start the API against `DB_NAME_TEST` on port `4001` for frontend integration checks |
| `npm run test:unit` | Run database-independent unit tests |
| `npm test` | Run all API and unit tests against `DB_NAME_TEST` |

In PowerShell, use `npm.cmd` if the `npm` PowerShell script is blocked by the local execution policy. Run `npm.cmd run db:test:setup` before `npm.cmd test`. The setup command drops and recreates the `public` schema **only in `DB_NAME_TEST`**; it refuses a database that is not the configured test database, equals `DB_NAME`, or does not end in `_test`. API tests truncate data only in that test database.

For the frontend integration check, use this order:

1. Run `npm run db:test:setup`.
2. Run `npm run db:test:seed-skills`.
3. Run `npm run dev:test` (port `4001`; its startup guard confirms the test database target).
4. Point the frontend Vite proxy to `http://localhost:4001`, then start the frontend.
5. Set `INTEGRATION_TARGET_IS_TEST_DB=yes` in the shell that runs `npm run check:integration`.

Both test-only commands refuse to run against `DB_NAME`, require a valid `DB_NAME_TEST` name ending in `_test`, and never seed or connect to the real application database.

## Layout

```text
backend/
  db/migrations/       Owner schema copies used only for test setup
  docs/API.md          Implemented HTTP contract and examples
  scripts/             Read-only schema check and guarded test DB setup
  src/
    config/            Validated environment config
    controllers/       HTTP request and response handling
    db/                Pool and transaction helper
    middleware/        Authentication and central error handling
    repositories/      Parameterized PostgreSQL queries
    routes/            API route registration
    services/          Business rules and pure matching algorithm
    utils/             Application errors, async handler, logger
    validators/        Hand-written input validation
  tests/               Unit tests and real test-database API tests
```

## Matching

Matching compares skill **ids**, not names. For a user and candidate, `forward` is the fraction of the user's wanted skills the candidate offers; `reverse` is the fraction of the candidate's wanted skills the user offers. A zero denominator contributes zero.

`score = round(100 * (forward + reverse) / 2)`.

This is a skill-coverage percentage, not a probability. A mutual match (both directions share at least one skill) ranks before any one-way match. Within a tier, results sort by score, number of shared skills, case-insensitive display name, then user id. Candidates with no shared skill ids are excluded. For example, if you want Python and offer React, and another developer offers Python and wants React, both directions are covered and the mutual score is 100.

## Known limitations

- Skill matching is exact skill-id only.
- Sessions require the owner-created `user_sessions` table.
- There is no email verification or password reset.
- There is no rate limiting.
- Accepted requests do not exchange contact details.
