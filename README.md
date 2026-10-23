# Skills Exchange Network

This workspace contains a PostgreSQL-backed Express API in `backend/` and a React + Vite frontend in `frontend/`. The apps share the parent workspace but do not import each other's source code.

## Run both applications

Prerequisites: Node.js 20 or newer, PostgreSQL, and an existing application database with the backend schema and session table applied.

1. Start PostgreSQL. Ensure migration `backend/db/migrations/001_initial_schema.sql` has been applied to the application database and `backend/db/migrations/002_session_table.sql` has created `user_sessions`.
2. Fill in the local `backend/.env` using `backend/.env.example`. Keep that file private and out of source control.
3. In terminal 1, start the API:

   ```powershell
   cd backend
   npm.cmd install
   npm.cmd run dev
   ```

   The backend listens on port `4000` by default.
4. In terminal 2, start the frontend:

   ```powershell
   cd frontend
   npm.cmd install
   npm.cmd run dev
   ```

   Vite listens on port `5173` and proxies `/api` to `http://localhost:4000`.
5. Open <http://localhost:5173>.

Use `npm install` instead of `npm.cmd install` in shells where `npm` is available directly.

The frontend's optional `API_PROXY_TARGET` setting is read by Vite only. Copy `frontend/.env.example` to `frontend/.env.local` and change the target only when the backend uses a different port.

## Integration verification

The integration check uses synthetic accounts and must only target the guarded backend test database. Follow the complete safe setup in [frontend/README.md](./frontend/README.md#safe-integration-check); it recreates only `DB_NAME_TEST` and starts the backend test server on port `4001`.

## Production deployment

In production, serve the frontend and `/api` from the same origin (for example, behind one reverse proxy). The session cookie is same-origin and the frontend does not configure cross-origin authentication.

See [backend/README.md](./backend/README.md) and [frontend/README.md](./frontend/README.md) for application details.
