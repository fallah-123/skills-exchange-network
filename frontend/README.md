# Skills Exchange Network frontend

The frontend is a responsive React application for developer profiles, skill lists, discovery, skill-overlap recommendations, and collaboration requests. It uses the existing Express API through Vite's same-origin `/api` proxy.

## Prerequisites and setup

- Node.js 20 or newer
- The backend and PostgreSQL configured as described in [the backend README](../backend/README.md)

Install and run from this directory:

```powershell
npm.cmd install
npm.cmd run dev
```

The app is served at <http://localhost:5173>. Vite proxies API calls to `http://localhost:4000` by default. If the backend runs elsewhere, copy `.env.example` to `.env.local` and set `API_PROXY_TARGET` to the backend origin, then restart Vite. This value is read by the Vite configuration and is not exposed to browser JavaScript.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Start Vite on port `5173` |
| `npm run build` | Create the production frontend in `dist/` |
| `npm run preview` | Preview the production build |
| `npm run check:integration` | Exercise the real API modules through Vite against the guarded test database |

## Folder map

```text
src/
  api/          Framework-free Fetch API modules and shared error handling
  components/   Layout, accessible UI primitives, and domain cards/actions
  context/      AuthContext and ToastContext
  hooks/        API loading, document title, and debounced values
  pages/        Public, profile, skills, discovery, match, request, and dashboard routes
  styles/       Design tokens and global base styles
  utils/        Input validation and display formatting
scripts/        Test-database-only integration check
docs/           Owner's manual browser checklist
```

## Routes and API calls

All authenticated routes first restore the server session using `GET /api/auth/me`.

| Route | Page | API calls |
|---|---|---|
| `/` | Landing | None beyond the startup session check |
| `/register` | Register | `POST /api/auth/register` |
| `/login` | Login | `POST /api/auth/login` |
| `/dashboard` | Dashboard | `GET /api/profile/me`, `/api/skills/me`, `/api/matches?limit=3`, `/api/requests/incoming?status=pending`, `/api/requests/outgoing?status=pending` |
| `/profile` | My Profile | `GET` and `PUT /api/profile/me` |
| `/skills` | Manage Skills | `GET /api/skills`, `GET /api/skills/me`, `POST` and `DELETE /api/skills/me/:skillType/:skillId` |
| `/developers` | Discover | `GET /api/developers?search=&page=&limit=` |
| `/developers/:id` | Developer Profile | `GET /api/developers/:id`, `POST /api/requests`, `POST /api/requests/:id/accept`, `POST /api/requests/:id/reject` |
| `/matches` | Recommended Developers | `GET /api/matches`, and request actions when needed |
| `/requests` | Collaboration Requests | `GET /api/requests/incoming` or `/outgoing`, accept/reject `POST` actions |
| `*` | Not found | None |

The backend mounts skill assignment operations at `/api/skills/me/:skillType` (with `offered` or `wanted` as the type), so the frontend uses those parameterized paths.

## Login state and session behavior

The browser stores no application records, user data, or tokens. The backend owns the `httpOnly` session cookie; the frontend never reads it. On startup `AuthContext` calls `GET /api/auth/me`. Login and logout update React auth state from the API response, and a protected API response with `UNAUTHENTICATED` clears the user and redirects to `/login`.

## Safe integration check

The script refuses to run unless `INTEGRATION_TARGET_IS_TEST_DB=yes` is set. Before running it, ensure the Vite proxy is pointed at the guarded `dev:test` server on port `4001`—not the real backend on port `4000`.

1. In a backend terminal, use the backend `.env` configuration for a distinct `DB_NAME_TEST` ending in `_test`, then run:

   ```powershell
   cd backend
   npm.cmd run db:test:setup
   npm.cmd run db:test:seed-skills
   npm.cmd run dev:test
   ```

   `db:test:setup` recreates the schema only in `DB_NAME_TEST`; both test-only commands reject a target that equals `DB_NAME` or does not end in `_test`. `dev:test` starts the real API on port `4001` with `NODE_ENV=test`.
2. In a separate frontend terminal, create `frontend/.env.local` with `API_PROXY_TARGET=http://localhost:4001`, then start Vite:

   ```powershell
   cd frontend
   npm.cmd run dev
   ```

3. In another terminal, enable the explicit test-target acknowledgement and run the check:

   ```powershell
   $env:INTEGRATION_TARGET_IS_TEST_DB='yes'
   npm.cmd run check:integration
   ```

   In a POSIX shell, use `INTEGRATION_TARGET_IS_TEST_DB=yes npm run check:integration`. The check imports the actual frontend API modules, exercises the Vite proxy, and creates synthetic users only in the configured test database. Delete `frontend/.env.local` or change its proxy target back to port `4000` before ordinary development.

## Known limitations

- Matching uses exact skill-id overlap only.
- Accepted requests do not exchange contact details; messaging is outside this app's scope.
- Production must serve the frontend and `/api` from the same origin for session-cookie authentication.
- There is no email verification, password reset, or account-management flow.

For a real-account browser workflow, use the unticked checklist in [docs/MANUAL_TEST.md](./docs/MANUAL_TEST.md).
