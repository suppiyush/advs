# ADVS — Admission Document Verification System

CS314 Software Development Lab prototype, Team T009 (LNMIIT Jaipur).

A web platform where applicants upload admission documents, admission office staff verify them, and
administrators manage checklists, users and reports.

**Stack:** Node.js + Express 5 (JavaScript, ES modules) · React 18 + Vite · PostgreSQL on Neon

**Look:** "Corporate Blue" light design system — navy collapsible sidebar, white cards, #2563EB primary,
Inter. Colours, radii and shadows are tokens at the top of `client/src/styles.css` (mirrored for charts in
`client/src/theme.js`); sidebar modules and breadcrumb titles are configured in `client/src/navigation.js`.

## Status

| Increment | Scope | State |
|---|---|---|
| 0 | Project setup, DB connection, migrations | Done |
| 1 | Registration, login/logout, role-based access, seed data | Done |
| 2 | Categories & checklists, applicant checklist and missing documents | Done |
| 3 | Document upload, replace/resubmit, file versions, access-checked downloads | Done |
| 4 | Pending-cases dashboard, document review, decisions with remarks, corrections | Done |
| 5 | In-app notifications (status changes, remarks, missing documents, new submissions) | Done |
| 6 | Users & roles, system settings, audit log, progress dashboard, reports | Done |
| 7 | Login throttling, production serving, demo data | Done |

## Setup

Requires Node.js 20+.

1. Install dependencies (from the repository root):
   ```bash
   npm install
   ```
2. Create `server/.env` from `server/.env.example` and fill in:
   - `DATABASE_URL`: the Neon connection string (`postgresql://...neon.tech/neondb?sslmode=require`); the
     direct endpoint is fine. If your DNS refuses the `-pooler` host, use the direct one.
   - `JWT_SECRET`: a long random string (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`)
   - `SEED_PASSWORD`: the password every demo user gets
3. Create the tables and load sample data:
   ```bash
   npm run migrate
   npm run seed
   ```
4. Optional — give the demo applicants documents in different states (safe to re-run; it resets them):
   ```bash
   npm run seed:demo
   ```
5. Start the API (port 5000) and the React app (port 5173) together:
   ```bash
   npm run dev
   ```
   Open http://localhost:5173.

### Demo users (after `npm run seed`)

All use the password set in `SEED_PASSWORD`.

| Role | Email | Notes |
|---|---|---|
| Administrator | admin@advs.local | |
| Verifier | verifier.gen@advs.local | Anita Singh, category General |
| Verifier | verifier.obc@advs.local | Vikram Rao, category OBC-NCL |
| Applicant | rahul.mehta@advs.local | General; after `seed:demo`: under review |
| Applicant | priya.sharma@advs.local | OBC-NCL; after `seed:demo`: a document rejected |
| Applicant | arjun.verma@advs.local | EWS; nothing uploaded |

## Tests

```bash
npm test
```

API tests (vitest + supertest) need a migrated and seeded database. They use `TEST_DATABASE_URL` if it is
set (recommended: a separate Neon branch), otherwise `DATABASE_URL`. They only create throwaway data
(`@advs.test` users, `CAT-T…` categories) and remove it afterwards; leftovers from an interrupted run are
removed at the start of the next one. A full run takes about 6 minutes against a remote database.

## Project layout

```
server/              Express API
  migrations/        SQL schema, applied in order by `npm run migrate`
  scripts/           migrate.js, seed.js, seed-demo.js
  src/config/        env, database pool, enums from the class diagram
  src/middleware/    auth (requireAuth / requireRole), validation, uploads, rate limits, errors
  src/services/      file store, audit log, settings
  src/modules/       auth, categories, documents, verification, notifications, admin, reports
  tests/             API tests, one file per area
client/              React app (Vite)
  src/api/           axios calls per area
  src/context/       AuthContext (current user and role)
  src/components/    Layout (sidebar, top bar), Breadcrumbs, NotificationBell, charts, StatusBadge,
                     StatusBar, ConfirmDialog, AuthLayout, ProtectedRoute
  src/navigation.js  sidebar groups per role and page titles for breadcrumbs
  src/theme.js       design tokens used by charts
  src/pages/         auth, applicant, verifier (staff), admin, shared
```
