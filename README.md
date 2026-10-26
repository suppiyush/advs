# ADVS — Admission Document Verification System

CS314 Software Development Lab prototype, Team T009 (LNMIIT Jaipur).

A web platform where applicants upload admission documents, admission office staff verify them, and
administrators manage checklists, users and reports. Requirements and UML models are in
[`docs/documentation.pdf`](docs/documentation.pdf); the build plan is in
[`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).

**Stack:** Node.js + Express 5 (JavaScript, ES modules) · React 18 + Vite · PostgreSQL on Neon

## Status

| Increment | Scope | State |
|---|---|---|
| 0 | Project setup, DB connection, migrations | Done |
| 1 | Registration, login/logout, role-based access, seed data | Done |
| 2 | Categories & checklists, applicant checklist and missing documents | Done |
| 3 | Document upload & missing documents | — |
| 4 | Verification workflow & pending dashboard | — |
| 5 | Notifications | — |
| 6 | Administration & reports | — |

## Setup

Requires Node.js 20+.

1. Install dependencies (from the repository root):
   ```bash
   npm install
   ```
2. Create `server/.env` from `server/.env.example` and fill in:
   - `DATABASE_URL`: the Neon **pooled** connection string (`...-pooler...neon.tech/...?sslmode=require`)
   - `JWT_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `SEED_PASSWORD`: the password every demo user gets
3. Create the tables and load sample data:
   ```bash
   npm run migrate
   npm run seed
   ```
4. Start the API (port 5000) and the React app (port 5173) together:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173.

### Demo users (after `npm run seed`)

All use the password set in `SEED_PASSWORD`.

| Role | Email | Notes |
|---|---|---|
| Administrator | admin@advs.local | |
| Verifier | verifier.gen@advs.local | Category CAT-GEN |
| Verifier | verifier.obc@advs.local | Category CAT-OBC |
| Applicant | rahul.mehta@advs.local | General |
| Applicant | priya.sharma@advs.local | OBC-NCL |
| Applicant | arjun.verma@advs.local | EWS |

## Tests

```bash
npm test
```

API tests (vitest + supertest) need a migrated and seeded database. They use `TEST_DATABASE_URL` if it is
set (recommended: a separate Neon branch), otherwise `DATABASE_URL`. They only create users with
`@advs.test` emails and delete them afterwards.

## Project layout

```
server/            Express API
  migrations/      SQL schema, applied in order by `npm run migrate`
  scripts/         migrate.js, seed.js
  src/config/      env, database pool, enums from the class diagram
  src/middleware/  auth (requireAuth / requireRole), validation, error handling
  src/modules/     auth, categories, documents, admin (more per increment)
  tests/
client/            React app (Vite)
  src/api/         axios calls
  src/context/     AuthContext (current user and role)
  src/components/  Layout, ProtectedRoute, StatusBadge
  src/pages/       auth, applicant, verifier, admin, shared
docs/              SRS / UML documentation and implementation plan
```
