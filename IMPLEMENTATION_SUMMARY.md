# Milestone 0 & 1 — Implementation Summary

This document maps **every deliverable and acceptance criterion** to the code and how to verify it. You’ve implemented almost everything in the backend; this is the “how you done everything” reference.

---

## Milestone 0 — Authorization

### Auth provider: session/JWT containing userId

| Deliverable | Where it lives | How to verify |
|-------------|----------------|---------------|
| JWT contains userId | JWT `sub` claim = user id. `JwtStrategy` validates and returns `{ userId, email }`. | Log in → `req.user.userId` is set in guards; `/auth/me` returns user id. |
| Sign in / sign out | `AuthController`: `POST /auth/signin`, `GET /auth/logout`. Cookies: `access_token`, `refresh_token`. | Sign in at frontend or `curl -X POST .../auth/signin -d '{"email":"user1@example.com","password":"dev12345"}'`; logout clears cookies. |

**Code:** `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/strategies/jwt.strategy.ts`, `src/auth/auth.constants.ts` (cookie names, expiry).

---

### Server-side session validation (guard)

| Deliverable | Where it lives | How to verify |
|-------------|----------------|---------------|
| Protected routes require valid JWT | `JwtAuthGuard` (Passport `jwt` strategy). Reads JWT from cookie `access_token` or `Authorization: Bearer <token>`. | Call `GET http://localhost:4000/orgs` without cookie/token → **401**. With valid JWT → 200. |

**Code:** `src/auth/jwt-auth.guard.ts`, `src/auth/strategies/jwt.strategy.ts`. All protected routes use `@UseGuards(JwtAuthGuard, ...)`.

---

### Membership lookup: userId → org memberships + roles, no trust in client orgId

| Deliverable | Where it lives | How to verify |
|-------------|----------------|---------------|
| userId → orgs + roles | `OrganizationsService.listForUser(userId, currentOrgId)` loads from `OrganizationMembership` + `MembershipRole`. `GET /orgs` uses **only** `userId` from JWT (via `OrgContextGuard` → `resolveAuthContext`). | Log in as user1@example.com → GET /orgs returns 2 orgs (Org A, Org B) with roles; no client-sent orgId. |
| currentOrgId from server only | `OrgContextService.resolveAuthContext()`: reads `UserCurrentOrg` or first membership; never uses client input for “current org”. | Backend RBAC test page shows currentOrgId; it comes from DB (UserCurrentOrg / membership), not from request body/query. |

**Code:** `src/common/context/org-context.service.ts`, `src/organizations/organizations.service.ts`, `src/organizations/organizations.controller.ts` (GET /orgs, POST /orgs/:id/switch).

---

### Acceptance: log in/out, session expires, server rejects unauthenticated

| Criterion | Verification |
|-----------|---------------|
| Log in | Frontend login or `POST /auth/signin` with user1@example.com / dev12345 → redirect or 200 with jwt. |
| Log out | `GET /auth/logout` (with JWT) clears cookies; frontend redirects to login. |
| Session expires | JWT expiry (e.g. 1h). After expiry, next request → 401. Or delete `access_token` cookie and call /orgs → 401. |
| Server rejects unauthenticated | `fetch('http://localhost:4000/orgs')` or `curl .../orgs` without cookie/Authorization → **401**. |

---

### Acceptance: user in 2 orgs resolved server-side

| Criterion | Verification |
|-----------|---------------|
| User in 2 orgs | Seed: user1@example.com is in Org A (ORG_ADMIN) and Org B (VIEWER). GET /orgs returns `currentOrgId` + list of 2 orgs; all from DB by userId. |

**Code:** `prisma/seed.ts` (memberships + MembershipRole); `OrgContextService.resolveAuthContext` + `OrganizationsService.listForUser`.

---

## Milestone 1 — Organization Context + Permissions

### Current organization context (server-side currentOrgId)

| Deliverable | Where it lives | How to verify |
|-------------|----------------|---------------|
| currentOrgId from session + membership | `OrgContextService.resolveAuthContext()`: UserCurrentOrg or first active membership. | Backend RBAC test: “Current org ID” at top; no client input. |
| In route handlers / service | `@AuthCtx() ctx: AuthContext`, `@CurrentOrgId() orgId`. Used in OrgsController, JobsController. | GET /orgs and POST /jobs/publish use `ctx.currentOrgId` / `@CurrentOrgId()`. |
| In service layer | `OrgContextService.resolveAuthContext(user)` used by OrgContextGuard; returns `currentOrgId`, `permissions`. | Guards run before controller; services receive resolved context via request or params. |

**Code:** `src/common/context/org-context.service.ts`, `src/common/context/org-context.guard.ts`, `src/common/context/auth-context.decorators.ts`, `src/organizations/organizations.controller.ts`, `src/jobs/jobs.controller.ts`.

---

### Permission model: hasPermission / requirePermission, role → permission server-side

| Deliverable | Where it lives | How to verify |
|-------------|----------------|---------------|
| requirePermission | `@RequirePermission('job:create')`, `@RequirePermission('job:publish')` on POST /jobs and POST /jobs/publish. `RequirePermissionGuard` checks `authContext.permissions`. | Org A (Admin) → POST /jobs/publish → **200**. Org B (Viewer) → POST /jobs/publish → **403**. |
| Role → permission server-side | Permissions come from `RolePermissionMapping` (role → AccessPermission). Resolved in `OrgContextService.resolveAuthContextForOrg()` for current org. | Same as above; no UI logic — only server-side role/permission resolution. |

**Code:** `src/rbac/require-permission.decorator.ts`, `src/rbac/require-permission.guard.ts`, `src/common/context/org-context.service.ts` (rolePermissionMapping + permissions array), `src/jobs/jobs.controller.ts`.

---

### Seed data: permissions, roles, role–permission mappings, idempotent

| Deliverable | Where it lives | How to verify |
|-------------|----------------|---------------|
| Canonical permissions | `access_permissions`: job:create, job:read, job:update, job:delete, job:publish. | `npm run db:seed` then check table `access_permissions`. |
| Default roles | AccessRole (ORG_ADMIN, RECRUITER, VIEWER, …). Seed assigns user1 to Org A (ORG_ADMIN) and Org B (VIEWER) via MembershipRole. | Check `membership_roles` and `organization_memberships`. |
| Role–permission mappings | `role_permission_mappings`: ORG_ADMIN → all job:*; VIEWER → job:read; etc. | Check table `role_permission_mappings`. |
| Idempotent seed | Seed uses `upsert` / `findFirst` + create only when missing. | Run `npm run db:seed` twice → no errors, same data. |

**Code:** `prisma/seed.ts` (PERMISSIONS, ROLE_PERMISSION_MATRIX, companies, user, memberships, MembershipRole, UserCurrentOrg).

---

### Acceptance: start app, log in with user in 2 orgs

- Start backend: `npm run start:dev`. Migrate + seed: `npx prisma migrate reset`, `npm run db:seed`.
- Log in: user1@example.com / dev12345 (frontend or POST /auth/signin). Backend RBAC test page shows 2 orgs.

---

### Acceptance: switching org changes currentOrgId

- On Backend RBAC test: note current org (e.g. Org A). Call POST /orgs/:orgId/switch with Org B id (from GET /orgs). GET /orgs again → currentOrgId and list show Org B as current.

**Code:** `POST /orgs/:orgId/switch` in OrganizationsController → `OrganizationsService.switchOrg()` → `OrgContextService.setCurrentOrg()` (writes UserCurrentOrg).

---

### Acceptance: permissions differ per org

- With Org A current: POST /jobs/publish → 200 (Admin has job:publish). Switch to Org B, POST /jobs/publish → 403 (Viewer does not).

---

### Acceptance: DB contains seeded roles & permissions

- After `npm run db:seed`: tables `access_permissions`, `role_permission_mappings`, `membership_roles`, `user_current_org` (and organization_memberships) contain the expected rows.

---

## Quick reference: important files

| Area | Files |
|------|--------|
| Auth (JWT, signin, logout, dev-login) | `src/auth/auth.controller.ts`, `src/auth/auth.service.ts`, `src/auth/jwt-auth.guard.ts`, `src/auth/strategies/jwt.strategy.ts`, `src/auth/auth.constants.ts` |
| Org context (currentOrgId, memberships) | `src/common/context/org-context.service.ts`, `src/common/context/org-context.guard.ts`, `src/common/context/auth-context.decorators.ts`, `src/common/context/auth-context.types.ts` |
| Orgs API (GET /orgs, switch) | `src/organizations/organizations.controller.ts`, `src/organizations/organizations.service.ts` |
| Permissions (requirePermission) | `src/rbac/require-permission.decorator.ts`, `src/rbac/require-permission.guard.ts`, `src/rbac/rbac.constants.ts` |
| Jobs (permission-protected) | `src/jobs/jobs.controller.ts` |
| Seed (permissions, roles, user, orgs) | `prisma/seed.ts` |
| Schema (User, Org, RBAC) | `prisma/schema.prisma` (OrganizationMembership, UserCurrentOrg, MembershipRole, AccessPermission, RolePermissionMapping) |

---

## How to test Milestone 1 (backend-only)

See **README.md** section **“How to test Milestone 1 (Organization Context + Permissions Foundation)”**:

1. `npm install`, `npx prisma migrate reset`, `npm run db:seed`, `npm run start:dev`.
2. Get JWT: `POST /auth/dev-login` with `{"email":"user1@example.com"}` or `POST /auth/signin` with `{"email":"user1@example.com","password":"dev12345"}`.
3. `GET /orgs` with `Authorization: Bearer $TOKEN` → currentOrgId + 2 orgs.
4. `POST /orgs/<ORG_B_ID>/switch` with Bearer token.
5. `POST /jobs/publish` with Bearer: 200 in Org A, 403 in Org B after switch.

For full demo script (including frontend), use **ACCEPTANCE_CRITERIA_DEMO.md**.
