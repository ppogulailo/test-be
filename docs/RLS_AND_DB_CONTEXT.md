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

| Table        | RLS enabled | FORCE RLS | Policy key column | Notes                          |
|-------------|-------------|-----------|-------------------|--------------------------------|
| **Job**     | Yes         | Yes       | `companyId`       | SELECT/INSERT/UPDATE/DELETE    |
| **Application** | Yes     | Yes       | `companyId`       | SELECT/INSERT/UPDATE/DELETE    |

**FORCE ROW LEVEL SECURITY** makes the table owner subject to RLS. However, **PostgreSQL superusers always bypass RLS**; so does any role with the `BYPASSRLS` attribute. For RLS to actually apply, the app (and the verify script) must connect as a **non-superuser role with NOBYPASSRLS**.

A migration creates the role **`ferdge_app`** (NOSUPERUSER, NOBYPASSRLS) and grants it access to all tables in `public`. To enforce RLS:

**Two-role workflow:** Run **migrations** only as the **table owner** (e.g. `appuser`); only the owner can create/alter RLS policies. Use **`ferdge_app`** in `DATABASE_URL` for the **application** and the **verify script**.

1. **Migrations:** In `.env` set `DATABASE_URL` to the table owner (e.g. `appuser`). Run `npx prisma migrate deploy`.  
2. **App and verify:** Switch `.env` to `ferdge_app`: `DATABASE_URL="postgresql://ferdge_app:ferdge_app_change_me@localhost:5432/deveteria?schema=public"`. Then run the app and `npx ts-node scripts/verify-rls.ts`.
3. **Production:** change `ferdge_app` password (as `appuser`: `ALTER ROLE ferdge_app PASSWORD '...';`) and update `DATABASE_URL`.

### Recovery from "must be owner of relation Job" (P3018 / 42501)

If a migration failed with **must be owner of relation Job**, migrations were run as `ferdge_app`. Fix it:

1. In `.env`, set `DATABASE_URL` to the **table owner** (e.g. `appuser`).
2. Mark the failed migration as rolled back: `npx prisma migrate resolve --rolled-back 20260203120004_rls_handle_unset_org_id`
3. Apply again: `npx prisma migrate deploy`
4. Switch `.env` back to `ferdge_app` for the app and verify script.

Policies use `NULLIF(current_setting('app.current_org_id', true), '')::integer` so that when the setting is unset (empty string), the expression becomes NULL and no rows match:

- **SELECT:** `USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer))`
- **INSERT / UPDATE / DELETE:** same expression in `WITH CHECK` / `USING` as needed.

If `app.current_org_id` is not set, the expression is NULL and **no rows** are returned or modified.

## Verification

- **Script:** `scripts/verify-rls.ts`
  - Sets context to org A and runs `findMany` **without** a `where` clause → only org A’s jobs are returned.
  - Sets context to org B and runs `findMany` without `where` → no rows from org A (proves cross-org leak is blocked).
  - Runs `findMany` in a transaction **without** `set_config` → 0 rows (proves missing context does not leak data).

Run after migrations and seed. Use the **table owner** in `DATABASE_URL` for migrate and seed; then switch to **`ferdge_app`** for the verify script (from **project root**):

```bash
npx prisma generate
# DATABASE_URL = table owner (e.g. appuser):
npx prisma migrate deploy
npm run db:seed
# Switch DATABASE_URL to ferdge_app, then:
npx ts-node scripts/verify-rls.ts
```

If you see an error like `Module '@prisma/client' has no exported member 'PrismaClient'`, run `npx prisma generate` from the project root and try again. Ensure your import uses `@prisma/client` with no space in the name.

## Removing the WHERE in code

If you temporarily remove the `where: { companyId }` from a service (e.g. in `JobsService.list`) but keep `runWithOrgContext(companyId, ...)`, RLS still restricts results to that org. The verification script demonstrates this by using `findMany` with no `where` and relying only on RLS.
