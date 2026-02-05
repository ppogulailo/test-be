# Backend documentation

NestJS API for authentication, organization context, and role-based access control (RBAC). This document is the entry point for the backend docs.

---

## Structure

| Directory | Contents |
|-----------|----------|
| **[milestones/](./milestones/)** | Milestone 0 (Authorization), 1 (Org context + permissions), 2a (RBAC + org isolation), 3 (Verification). Each includes scope, acceptance, and how to test. |
| **[architecture/](./architecture/)** | App structure, auth flow, org context, RBAC, guards, [How RBAC works](./architecture/how-rbac-works), [RLS and DB context](./architecture/rls-db-context). |
| **[reference/](./reference/)** | [Setup](./reference/setup.md), [API Reference](./reference/api-reference.md). |

---

## Quick links

| Document | Description |
|----------|-------------|
| [Setup](./reference/setup.md) | Environment variables, database, migrations, seed, running the API |
| [Architecture](./architecture/architecture.md) | App structure, auth flow, org context, RBAC, guards and decorators |
| [API Reference](./reference/api-reference.md) | All HTTP endpoints with request/response and auth requirements |
| [Milestone 0 – Authorization](./milestones/milestone-0-authorization.md) | Production auth + membership resolution (replace dev auth) |
| [Milestone 1 – Org context + permissions](./milestones/milestone-1-org-context-permissions.md) | currentOrgId, permission model, seed (roles & permissions) |
| [Milestones index](./milestones/README.md) | All milestones (0, 1, 2a, 3) |

---

## Quick overview

- **Stack:** NestJS, Prisma, PostgreSQL, JWT (Passport), bcrypt.
- **Auth:** JWT in cookie (`access_token`) or `Authorization: Bearer <token>`. User id in JWT `sub`; no trust in client-sent org id.
- **Org context:** Current organization is resolved server-side from `UserCurrentOrg` or the user's first active membership. Used for multi-tenant RBAC.
- **RBAC:** Permissions are resolved from `RolePermissionMapping` for the user's role in the current org. Routes can require specific permissions via `@RequirePermission('permission:action')`.

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

API runs at `http://localhost:4000` (or the port set by `PORT`). See [Setup](./reference/setup.md) for details.

---

## Seeded demo user

After `npm run db:seed`:

- **Email:** `user1@example.com`
- **Password:** `dev12345` (8+ characters)
- **Orgs:** Org A (role: admin), Org B (role: viewer)

Use this user to call `/auth/signin`, then `/orgs` and `/jobs/publish` to verify org context and permissions.
