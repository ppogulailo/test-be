# Architecture

How the backend is structured and how auth, org context, and RBAC work.

---

## Project structure

```
src/
├── app.module.ts              # Root module: imports Config, Prisma, Auth, Context, Orgs, Rbac, Jobs
├── main.ts                    # Bootstrap: cookie-parser, CORS, global ValidationPipe
├── auth/                      # Authentication
│   ├── auth.controller.ts    # signup, signin, me, logout, refresh
│   ├── auth.service.ts       # signUp, signIn, getMe, logout, refreshTokens, issueTokens
│   ├── auth.constants.ts      # token expiry, cookie names, cookie options
│   ├── auth.types.ts          # JwtPayload, RequestUser, AuthTokens, etc.
│   ├── jwt-auth.guard.ts      # Passport JWT guard
│   ├── strategies/jwt.strategy.ts  # JWT from cookie or Bearer header; validates and sets req.user
│   └── dto/                   # AuthDto, SignUpDto
├── common/
│   ├── context/               # Organization context (current org, permissions)
│   │   ├── org-context.service.ts   # resolveAuthContext, setCurrentOrg, resolveAuthContextForOrg
│   │   ├── org-context.guard.ts     # After JWT: loads authContext (currentOrgId, permissions) onto request
│   │   ├── auth-context.types.ts    # AuthContext (userId, email, currentOrgId, roleKey, permissions)
│   │   ├── auth-context.decorators.ts  # @AuthCtx(), @CurrentOrgId(), @UserId()
│   │   ├── request.types.ts    # RequestWithAuth (user, authContext)
│   │   └── context.module.ts  # Exports OrgContextService
│   └── utils/
│       └── access-role.util.ts  # accessRoleToKey (AccessRole → string key)
├── organizations/
│   ├── organizations.controller.ts  # GET /orgs, POST /orgs/:id/switch
│   ├── organizations.service.ts     # listForUser, switchOrg
│   └── organizations.module.ts
├── jobs/
│   ├── jobs.controller.ts     # POST /jobs (job:create), POST /jobs/publish (job:publish)
│   └── jobs.module.ts
├── rbac/
│   ├── require-permission.decorator.ts  # @RequirePermission('permission:action')
│   ├── require-permission.guard.ts      # Checks authContext.permissions
│   ├── rbac.constants.ts      # RBAC_REQUIRED_PERMISSIONS_KEY
│   └── rbac.module.ts
└── prisma/
    ├── prisma.service.ts      # PrismaClient
    └── prisma.module.ts
```

---

## Authentication flow

1. **Sign in:** Client sends `POST /auth/signin` with `email` and `password`. Server hashes comparison, issues access + refresh JWTs, sets cookies `access_token` and `refresh_token`, returns `jwt` and `id`.
2. **JWT content:** Access token payload includes `sub` (user id) and `email`. `JwtStrategy` validates the token (from cookie `access_token` or `Authorization: Bearer <token>`) and sets `req.user = { userId, email }`.
3. **Protected routes:** Controllers use `@UseGuards(JwtAuthGuard)`. Without a valid JWT, Passport returns **401 Unauthorized**.
4. **Refresh:** Client sends `GET /auth/refresh` with cookie `refresh_token`. Server issues a new access token and sets `access_token` cookie.
5. **Logout:** Client calls `GET /auth/logout` (with valid JWT). Server clears `access_token` and `refresh_token` cookies.

**Important:** The server never trusts an organization id from the client. Current org is always resolved server-side from the database using `userId` from the JWT.

---

## Organization context flow

For routes that need “current org” and permissions (e.g. `/orgs`, `/jobs/*`):

1. **JwtAuthGuard** runs first and sets `req.user` from the JWT.
2. **OrgContextGuard** runs next. It calls `OrgContextService.resolveAuthContext(req.user)`:
   - Reads `UserCurrentOrg` for the user; if set and user is still a member of that org, uses that as current org.
   - Otherwise uses the user’s first active `OrganizationMembership` and (optionally) writes it to `UserCurrentOrg`.
   - Loads the user’s role in that org from `MembershipRole` (org-level: `departmentId` null).
   - Loads permissions from `RolePermissionMapping` for that role.
   - Returns `AuthContext`: `userId`, `email`, `currentOrgId`, `roleKey`, `permissions`.
3. The guard sets `req.authContext = authContext`. Handlers can use `@AuthCtx() ctx`, `@CurrentOrgId() orgId`, or `@UserId() userId`.

**Switching org:** Client calls `POST /orgs/:id/switch` with an org id. Server checks that the user has an active membership in that org, then updates `UserCurrentOrg` for the user. Subsequent requests use the new current org.

---

## RBAC (permissions)

- **Model:** Permissions are stored in `AccessPermission` (e.g. `job:create`, `job:publish`). `RolePermissionMapping` links `AccessRole` (e.g. ORG_ADMIN, RECRUITER, VIEWER) to permissions. A user’s permissions in a request are the permissions of their **current-org role** (from `MembershipRole` + `RolePermissionMapping`).
- **Usage:** Controllers that need a specific permission use `@RequirePermission('permission:action')` and `RequirePermissionGuard`. The guard runs after `OrgContextGuard` and checks that `req.authContext.permissions` includes every required permission. If not, it returns **403 Forbidden**.
- **Example:** `POST /jobs/publish` requires `job:publish`. User in Org A (ORG_ADMIN) has it → 200. Same user in Org B (VIEWER) does not → 403.

---

## Guards order

For routes that use both org context and permissions (e.g. jobs):

1. `JwtAuthGuard` — ensures `req.user` (userId, email).
2. `OrgContextGuard` — ensures `req.authContext` (currentOrgId, permissions).
3. `RequirePermissionGuard` — ensures `authContext.permissions` contains the required permission(s).

---

## Database (Prisma) — relevant models

| Model | Purpose |
|-------|--------|
| `User` | Account; id used as JWT `sub`. |
| `UserSession` | (Optional) server-side sessions; not required for current JWT-only flow. |
| `Company` | Organization (org). |
| `OrganizationMembership` | User–org link; one row per user–org pair. |
| `UserCurrentOrg` | Current org for each user (one row per user). |
| `MembershipRole` | Role per membership (e.g. ORG_ADMIN, RECRUITER, VIEWER); can be org-level or department-level. |
| `AccessPermission` | Canonical permission names (e.g. job:create, job:publish). |
| `RolePermissionMapping` | Which `AccessRole` has which `AccessPermission`. |

Current org is determined by `UserCurrentOrg` or, if missing, the first active membership. Permissions are determined by the user’s role(s) in the current org via `MembershipRole` and `RolePermissionMapping`.

---

## CORS and cookies

- **CORS:** Configured in `main.ts` with `origin: config.corsOrigin` (e.g. `FRONTEND_ORIGIN`) and `credentials: true` so the frontend can send cookies.
- **Cookies:** Access and refresh tokens are set as httpOnly, sameSite `lax` cookies. Ensure the frontend calls the API with `credentials: 'include'` when using cookies.
