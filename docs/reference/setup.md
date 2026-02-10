# Setup

How to configure the environment, database, and run the backend.

---

## Requirements

- Node.js (LTS)
- PostgreSQL
- npm or yarn

---

## Environment variables

Copy the example env and set values:

```bash
cp env.example .env
# Edit .env and set DATABASE_URL and JWT_SECRET
```

**Prisma 7:** The Prisma config (`prisma.config.ts`) loads `DATABASE_URL` via `env('DATABASE_URL')`. Ensure `.env` exists and contains `DATABASE_URL` when you run `prisma migrate deploy` or `prisma db seed`; otherwise those commands will fail.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/dbname?schema=public` |
| `JWT_SECRET` | Yes | Secret used to sign and verify JWTs. Use a long random value in production. |
| `PORT` | No | HTTP port. Default from code is `3000`; `env.example` uses `4000`. |
| `FRONTEND_ORIGIN` | No | Allowed CORS origin for the frontend, e.g. `http://localhost:3000`. |
| `NODE_ENV` | No | `production` / `development`; affects CORS and optional dev-only features. |

---

## Database

### Migrations

Apply migrations (create/update schema):

```bash
npx prisma migrate deploy
```

For local development, reset and re-apply (wipes data):

```bash
npx prisma migrate reset
```

### Seed

Seed creates canonical permissions, role–permission mappings, two demo orgs (Org A, Org B), and a demo user in both orgs. **Requires `DATABASE_URL` in `.env`** (and migrations applied):

```bash
# From project root, with .env containing DATABASE_URL
npx prisma generate
npx prisma migrate deploy
npm run db:seed
```

`npm run db:seed` runs `ts-node prisma/seed.ts` directly. Seed is idempotent; safe to run multiple times.

**Seeded data:**

- **Permissions:** e.g. `job:create`, `job:read`, `job:update`, `job:delete`, `job:publish`
- **Role–permission mappings:** ORG_ADMIN → all job:*; RECRUITER → create/read/update/publish; VIEWER → job:read
- **Companies:** "Org A", "Org B"
- **User:** `user1@example.com` / `dev12345`, in Org A (ORG_ADMIN) and Org B (VIEWER)
- **UserCurrentOrg:** demo user's current org set to Org A

---

## Running the API

```bash
npm install
npm run start:dev
```

- **start:** one-off run
- **start:dev:** watch mode (restart on file changes)
- **start:prod:** production build and run (`npm run build` then `node dist/main.js`)

Default port is `3000` unless overridden by `PORT` (e.g. `4000` in `.env`).

---

## Docker (optional)

Project includes `Dockerfile` and `docker-compose.yml`. Use them to run Postgres and/or the app in containers; see those files for commands and env wiring.

---

## Verification

1. **Health:** Open `http://localhost:PORT` (root route if configured) or any protected route without auth → expect 401 for protected routes.
2. **Auth:** `POST /auth/signin` with `{"email":"user1@example.com","password":"dev12345"}` → 201 with `jwt` and cookies.
3. **Orgs:** `GET /orgs` with `Authorization: Bearer <jwt>` → `currentOrgId` and list of orgs (e.g. Org A, Org B).

See [API Reference](./api-reference.md) and [Architecture](../architecture/architecture.md) for details.
