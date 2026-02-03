# RLS and DB context (Milestone 2B)

## How RLS context is set

- **Per request:** The Nest app does **not** set a global session variable for the whole HTTP request. Instead, every org-scoped operation runs inside **`PrismaService.runWithOrgContext(orgId, fn)`**.
- **Inside that helper:** A **transaction** is started. At the start of the transaction we run:
  ```sql
  SELECT set_config('app.current_org_id', '<currentOrgId>', true);
  ```
  The third argument `true` means **transaction-local**: the setting is only visible inside that transaction and does not leak to other connections or requests.
- **Then** the callback `fn(tx)` runs all Prisma queries using the transaction client `tx`. Those queries run in the same transaction, so they see `app.current_org_id` and Postgres RLS policies apply.
- **Who calls it:** Services that need org isolation (e.g. `JobsService`, `ApplicationsService`) receive `currentOrgId` from the controller (from `OrgContextGuard` / `req.authContext`) and call `this.prisma.runWithOrgContext(companyId, (tx) => tx.job.findMany(...))` for all reads/writes.

So “DB context” is set **per transaction**, not per HTTP request globally. Each request that hits an org-scoped endpoint runs one or more such transactions with the same `orgId`.

## Which tables are protected

| Table        | RLS enabled | Policy key column | Notes                          |
|-------------|-------------|-------------------|--------------------------------|
| **Job**     | Yes         | `companyId`       | SELECT/INSERT/UPDATE/DELETE    |
| **Application** | Yes     | `companyId`       | SELECT/INSERT/UPDATE/DELETE    |

Policies use:

- **SELECT:** `USING ("companyId" = (current_setting('app.current_org_id', true))::integer)`
- **INSERT:** `WITH CHECK ("companyId" = ...)`
- **UPDATE:** `USING (...)` and `WITH CHECK (...)`
- **DELETE:** `USING (...)`

If `app.current_org_id` is not set (e.g. a query runs outside `runWithOrgContext`), `current_setting(..., true)` returns `NULL` and the comparison fails, so **no rows** are returned or modified.

## Verification

- **Script:** `scripts/verify-rls.ts`
  - Sets context to org A and runs `findMany` **without** a `where` clause → only org A’s jobs are returned.
  - Sets context to org B and runs `findMany` without `where` → no rows from org A (proves cross-org leak is blocked).
  - Runs `findMany` in a transaction **without** `set_config` → 0 rows (proves missing context does not leak data).

Run after migrations and seed (from **project root**, with `.env` containing `DATABASE_URL`):

```bash
npx prisma generate
npx prisma migrate deploy
npm run db:seed
npx ts-node scripts/verify-rls.ts
```

If you see an error like `Module '@prisma/client' has no exported member 'PrismaClient'`, run `npx prisma generate` from the project root and try again. Ensure your import uses `@prisma/client` with no space in the name.

## Removing the WHERE in code

If you temporarily remove the `where: { companyId }` from a service (e.g. in `JobsService.list`) but keep `runWithOrgContext(companyId, ...)`, RLS still restricts results to that org. The verification script demonstrates this by using `findMany` with no `where` and relying only on RLS.
