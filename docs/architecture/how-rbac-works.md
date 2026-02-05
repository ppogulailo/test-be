# How RBAC works (backend)

Short guide for developers: how permissions and org isolation work, where to add permissions, and how to protect a new endpoint.

---

## 1. How it works

**Auth:** User signs in → JWT (userId, email). No org or role in the token.

**Org context (per request):** After JWT, `OrgContextGuard` runs. It looks up the user's **current org** from the DB (`UserCurrentOrg` or first membership). The server **never** uses a client-sent org id as "current org"; it always comes from the DB. Then it loads the user's **role** in that org (`MembershipRole`) and the **permissions** for that role (`RolePermissionMapping` → `AccessPermission`). Result: `req.authContext = { userId, currentOrgId, roleKey, permissions }`.

**Permission check:** Routes that need a permission use `@RequirePermission('job:read')` (or similar) and `RequirePermissionGuard`. The guard runs after org context and checks that `authContext.permissions` contains every listed permission. If not → **403 Forbidden**.

**Org isolation:** For org-scoped resources (jobs, applications), the handler uses `currentOrgId` from `authContext` (and optionally `userId` and `roleKey` for Recruiter vs Admin scope). Services filter by `companyId` and, for Recruiter, by own/assigned. Single-resource access uses `assertOrgAccess(entity.companyId, currentOrgId)` so cross-org access returns **403**.

**Guards order:** `JwtAuthGuard` → `OrgContextGuard` → `RequirePermissionGuard`. Then the controller calls the service with `authContext` (or companyId/userId/roleKey).

---

## 2. Where to add new permissions

1. **DB (seed + migrations if needed)**  
   In `prisma/seed.ts`, add the permission name to the `PERMISSIONS` array (e.g. `{ name: 'candidate:read' }`). Ensure the permission is created (upsert) in `AccessPermission` and that the right roles get it via `ROLE_PERMISSION_MATRIX` (and seed `RolePermissionMapping`).

2. **No code change for "definition"**  
   Permissions are strings (e.g. `job:read`). The guard only checks that the required string is in `authContext.permissions`, which comes from the DB. So adding a new permission is: seed it, assign it to roles, then use it on routes (next section).

3. **Optional: tests**  
   In `src/rbac/role-permission-matrix.spec.ts`, add the new permission to the expected role list so the contract is documented and regression-tested.

---

## 3. How to protect a new endpoint

**Step 1 – Guards and decorator**  
On the controller (or specific method), use:

- `@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)` so you have `req.authContext`.
- `@RequirePermission('permission:action')` for the permission(s) required (e.g. `@RequirePermission('job:read')`).

**Step 2 – Use auth context in the handler**  
Inject org (and optionally user/role) from the request, not from the client body/query:

- `@AuthCtx() auth: AuthContext` then `auth.currentOrgId`, `auth.userId`, `auth.roleKey`.
- Or `@CurrentOrgId() orgId: string` and `@UserId() userId: string` if you only need those.

**Step 3 – Service layer**  
In the service:

- For **list** endpoints: build the query filter from `companyId` (and for Recruiter, from `userId`/role so only own/assigned data is visible). Use `jobWhereForScope(companyId, userId, roleKey)` for jobs if you follow the same scope model; for other resources, apply the same idea (org-wide vs own/assigned).
- For **single resource** (get one, update, delete): load the entity, then call `assertOrgAccess(entity.companyId, currentOrgId)` (and, if Recruiter, check own/assigned) before returning or modifying. If the check fails, throw (e.g. `ForbiddenException`).

**Step 4 – Swagger (optional)**  
Add `@ApiBearerAuth('access_token')` and `@ApiOperation` / `@ApiResponse` so the new endpoint appears in Swagger with the right permission.

**Example (conceptual):**

```ts
// Controller
@Get()
@RequirePermission('job:read')
list(@AuthCtx() auth: AuthContext) {
  return this.jobsService.list({
    companyId: parseInt(auth.currentOrgId, 10),
    userId: parseInt(auth.userId, 10),
    roleKey: auth.roleKey,
  });
}

// Service
async list(ctx: { companyId: number; userId: number; roleKey: string }) {
  const where = jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);
  return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
    tx.job.findMany({ where, ... }),
  );
}
```

A new dev can protect a new endpoint by: adding the permission in seed (and role mapping), then applying the four steps above.
