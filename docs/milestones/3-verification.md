# Milestone 3 – Hardening + Proof: Verification

## Audit check (confirmations)

| Check | Status | Notes |
|-------|--------|--------|
| **No RBAC in frontend** | ✓ | Authorization (permissions, org scope, role) is enforced only in the **backend**. The frontend may show/hide UI based on role for UX, but the API does not rely on it; every protected request is checked server-side (JWT → org context → permissions + scope). |
| **No trust in client-sent orgId** | ✓ | Current org is resolved server-side from `UserCurrentOrg` or `OrganizationMembership` using `userId` from the JWT. Controllers use `@CurrentOrgId()` / `@AuthCtx()` from `req.authContext`, not from query/body. Org switch is validated: `POST /orgs/:id/switch` checks membership before updating. |
| **One schema source of truth** | ✓ | Prisma schema (`prisma/schema.prisma`) defines all models. Migrations are generated from it. No duplicate or conflicting schema definitions. |

---

## Verification checklist (short)

- [ ] **Unit tests:** `npm test` — all RBAC-related tests pass (permission denial: `require-permission.guard.spec`; org isolation: `org-access.util.spec`; scope: `scope.util.spec`; role–permission: `role-permission-matrix.spec`). If a non-RBAC spec fails (e.g. missing app.controller), run `npm test -- --testPathIgnorePatterns=app.controller.spec`.
- [ ] **Doc:** A new dev can protect an endpoint by following [How RBAC works](../architecture/how-rbac-works) (add permission in seed → guards + `@RequirePermission` → use `AuthCtx` in handler → scope/assert in service).
- [ ] **Deny/allow in <10 min:** Follow “Reproduce deny/allow (manual)” below.
- [ ] **Audit:** No RBAC in frontend; no trust in client orgId; one Prisma schema.

---

## Reproduce deny/allow (manual, <10 min)

**Prereq:** Backend running (`npm run start:dev`), DB seeded (`npm run db:seed`). Use seeded user e.g. `user1@example.com` / `dev12345`, in Org A (admin) and Org B (viewer).

1. **Get JWT**
   ```bash
   curl -s -X POST http://localhost:4000/auth/signin \
     -H "Content-Type: application/json" \
     -d '{"email":"user1@example.com","password":"dev12345"}' | jq -r '.jwt'
   ```
   Set `TOKEN=<paste>`.

2. **Allow – Admin in Org A**
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/orgs | jq .currentOrgId
   # If not 1, switch: curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/orgs/1/switch
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/jobs | jq length
   ```
   Expect a list (e.g. 0 or more jobs). **Allow.**

3. **Deny – Viewer (missing permission)**
   ```bash
   curl -s -X POST -H "Authorization: Bearer $TOKEN" http://localhost:4000/orgs/2/switch
   curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:4000/jobs \
     -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
     -d '{"title":"T","experience":"MID","employmentType":"LONG_TERM","workArrangement":"REMOTE","responsibilities":[],"requirements":[],"niceToHave":[],"perks":[],"whoYouAre":[],"tags":[]}'
   ```
   Expect **403** (Viewer has no `job:create`). **Deny.**

4. **Allow – Viewer read**
   ```bash
   curl -s -H "Authorization: Bearer $TOKEN" http://localhost:4000/jobs | jq length
   ```
   Expect 200 and a list. **Allow.**

5. **Deny – No token**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:4000/jobs
   ```
   Expect **401**. **Deny.**

You have reproduced allow (admin list, viewer list) and deny (viewer create → 403, no token → 401) in a few minutes.

---

## Tests summary

| Test file | Covers |
|-----------|--------|
| `require-permission.guard.spec.ts` | Permission denial (missing permission → 403; missing auth context → 403). |
| `org-access.util.spec.ts` | Org isolation (wrong org or invalid orgId → ForbiddenException). |
| `scope.util.spec.ts` | Scope rules (org-wide vs recruiter own/assigned). |
| `role-permission-matrix.spec.ts` | Role→permission contract. |

Run: `npm test`.
