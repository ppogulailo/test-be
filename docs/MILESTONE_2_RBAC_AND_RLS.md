# Milestone 2 & 2B – RBAC enforcement, org isolation, RLS

## Deliverables

### Milestone 2: RBAC enforcement + org isolation

- **RBAC helpers (server-side only):**
  - `requirePermission("job:publish")` – via `@RequirePermission('job:publish')` and `RequirePermissionGuard`.
  - `assertOrgAccess(entityOrgId, currentOrgId)` – in `src/common/rbac/org-access.util.ts`; throws `ForbiddenException` if the entity is not in the current org.

- **Org scoping in queries:**
  - **Jobs:** All reads/writes in `JobsService` are scoped by `companyId` (current org). List, getOne, create, publish use `runWithOrgContext(companyId, ...)` and/or `where: { companyId }` and `assertOrgAccess` for single-resource checks.
  - **Applications (pipeline):** `ApplicationsService.list` is scoped by `companyId`; optional filter by `jobId`.
  - No query returns cross-org data.

- **Protected endpoints:**

  | Method | Endpoint | Permission | Description |
  |--------|----------|------------|-------------|
  | GET | /jobs | job:read | List jobs (current org only). |
  | GET | /jobs/:id | job:read | Get one job (403 if other org). |
  | POST | /jobs | job:create | Create job in current org. |
  | POST | /jobs/:id/publish | job:publish | Publish job (403 if other org or no permission). |
  | GET | /applications | job:read | List applications (current org; optional ?jobId=). |

- **Acceptance:**
  - Recruiter from Company A cannot see Company B data: use token for user in Org A, call GET /jobs → only A’s jobs; switch to Org B (POST /orgs/:id/switch), GET /jobs → only B’s jobs.
  - Recruiter without permission gets 403: use user in Org B (Viewer, only job:read). POST /jobs or POST /jobs/:id/publish → 403.
  - Admin succeeds: same user in Org A (Admin) can GET /jobs, POST /jobs, POST /jobs/:id/publish.

### Milestone 2B: Postgres RLS

- **RLS:** Enabled on `Job` and `Application`. Policies for SELECT/INSERT/UPDATE/DELETE use `current_setting('app.current_org_id', true)::integer` and column `companyId`.
- **DB context:** Implemented in Nest/Prisma via `PrismaService.runWithOrgContext(orgId, fn)`, which runs `set_config('app.current_org_id', orgId, true)` at the start of a transaction, then runs the callback so all queries in that transaction see the setting.
- **Verification:** Script `scripts/verify-rls.ts` proves correct org can read; wrong org or no context cannot see other org’s rows even without a WHERE filter.
- **Docs:** “How RLS context is set” and “Which tables are protected” are in `docs/RLS_AND_DB_CONTEXT.md`.

## Reproducible steps (API)

1. **Seed and get JWT**
   ```bash
   npm run db:seed
   # Get token (signin or dev-login)
   export TOKEN="<jwt>"
   ```

2. **List orgs and switch**
   ```bash
   curl -s "http://localhost:4000/orgs" -H "Authorization: Bearer $TOKEN"
   # Note org A and B ids; current org is A (admin).
   curl -s -X POST "http://localhost:4000/orgs/<ORG_B_ID>/switch" -H "Authorization: Bearer $TOKEN"
   ```

3. **Recruiter from A cannot see B (after switch to B)**
   ```bash
   # Now current org is B. List jobs (B’s only).
   curl -s "http://localhost:4000/jobs" -H "Authorization: Bearer $TOKEN"
   ```

4. **Viewer in B gets 403 on write**
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:4000/jobs" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test","experience":"MID","employmentType":"LONG_TERM","workArrangement":"REMOTE","responsibilities":[],"requirements":[],"niceToHave":[],"perks":[],"whoYouAre":[],"tags":[]}'
   # Expect 403 (Viewer has job:read only).
   ```

5. **Admin in A succeeds**
   ```bash
   curl -s -X POST "http://localhost:4000/orgs/<ORG_A_ID>/switch" -H "Authorization: Bearer $TOKEN"
   curl -s -X POST "http://localhost:4000/jobs" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"title":"Test Job","experience":"MID","employmentType":"LONG_TERM","workArrangement":"REMOTE","responsibilities":[],"requirements":[],"niceToHave":[],"perks":[],"whoYouAre":[],"tags":[]}'
   # Expect 201 and job object.
   ```

6. **RLS verification**
   ```bash
   npx prisma migrate deploy
   npx ts-node scripts/verify-rls.ts
   # Expect “RLS verification passed.”
   ```

## Endpoints covered (Milestone 2)

- **GET /jobs** – read, scoped by org, requires job:read.
- **GET /jobs/:id** – read one, 403 if other org, requires job:read.
- **POST /jobs** – write, scoped by org, requires job:create.
- **POST /jobs/:id/publish** – write, 403 if other org or no job:publish.
- **GET /applications** – read, scoped by org, requires job:read.
