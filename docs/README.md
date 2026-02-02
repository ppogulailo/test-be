# Backend documentation

NestJS API for authentication, organization context, and role-based access control (RBAC). This document is the entry point for the backend docs.

---

## Contents

| Document | Description |
|----------|-------------|
| [Setup](./setup.md) | Environment variables, database, migrations, seed, running the API |
| [Architecture](./architecture.md) | App structure, auth flow, org context, RBAC, guards and decorators |
| [API Reference](./api-reference.md) | All HTTP endpoints with request/response and auth requirements |

---

## Quick overview

- **Stack:** NestJS, Prisma, PostgreSQL, JWT (Passport), bcrypt.
- **Auth:** JWT in cookie (`access_token`) or `Authorization: Bearer <token>`. User id in JWT `sub`; no trust in client-sent org id.
- **Org context:** Current organization is resolved server-side from `UserCurrentOrg` or the user’s first active membership. Used for multi-tenant RBAC.
- **RBAC:** Permissions are resolved from `RolePermissionMapping` for the user’s role in the current org. Routes can require specific permissions via `@RequirePermission('permission:action')`.

---

## Quick start

```bash
# 1. Environment
cp env.example .env
# Set DATABASE_URL and JWT_SECRET in .env

# 2. Database
npm install
npx prisma migrate deploy
npm run db:seed

# 3. Run
npm run start:dev
```

API runs at `http://localhost:4000` (or the port set by `PORT`). See [Setup](./setup.md) for details.

---

## Seeded demo user

After `npm run db:seed`:

- **Email:** `user1@example.com`
- **Password:** `dev12345` (8+ characters)
- **Orgs:** Org A (role: admin), Org B (role: viewer)

Use this user to call `/auth/signin`, then `/orgs` and `/jobs/publish` to verify org context and permissions.
