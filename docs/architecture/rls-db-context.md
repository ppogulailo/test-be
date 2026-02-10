# RLS and DB context (Milestone 2B)

## How RLS context is set

- The app does **not** set a global session variable for the whole HTTP request. Every org-scoped operation runs inside **`PrismaService.runWithOrgContext(orgId, fn)`**.
- **Inside that helper:** A **transaction** is started. At the start we run:
  ```sql
  SELECT set_config('app.current_org_id', '<orgId>', true);
  ```
  The third argument `true` means **transaction-local**: the setting is visible only inside that transaction and does not leak to other connections or requests.
- The callback `fn(tx)` then runs all Prisma queries using the transaction client. Those queries run in the same transaction, so they see `app.current_org_id` and Postgres RLS policies apply.
- **Who calls it:** Services that need org isolation (e.g. `JobsService`, `ApplicationsService`) receive `currentOrgId` from the controller and call `this.prisma.runWithOrgContext(companyId, (tx) => tx.job.findMany(...))` for reads/writes.

So DB context is set **per transaction**, not per HTTP request globally.

## Which tables are protected

| Table         | RLS enabled | FORCE RLS | Policy key column |
|---------------|-------------|-----------|-------------------|
| **Job**       | Yes         | Yes       | companyId         |
| **Application** | Yes       | Yes       | companyId         |

Policies for SELECT, INSERT, UPDATE, and DELETE use:
- `NULLIF(current_setting('app.current_org_id', true), '')::integer` so that when the setting is unset (empty string), the expression becomes NULL and no rows match.
- Row visibility/checks compare `companyId` to that value.

**FORCE ROW LEVEL SECURITY** means the table owner is also subject to RLS. Postgres **superusers** and roles with **BYPASSRLS** still bypass RLS. To enforce RLS, the application (and the verification script) must connect as a role that does **not** bypass RLS (e.g. **`ferdge_app`**).

### Two-role workflow

1. **Migrations:** Run `npx prisma migrate deploy` with `DATABASE_URL` set to the **table owner** (the user that created the tables). Only the owner can create or alter RLS policies.
2. **App and verify script:** Set `DATABASE_URL` to **`ferdge_app`** (password set in migration `20260203120003_ferdge_app_password`). Then run the app and `npx ts-node scripts/verify-rls.ts`. RLS will apply.

### Recovery from "must be owner of relation Job"

If a migration fails with that error, migrations were run as `ferdge_app`. Use the table owner in `DATABASE_URL`, then:

```bash
npx prisma migrate resolve --rolled-back <failed_migration_name>
npx prisma migrate deploy
```

Then switch `DATABASE_URL` back to `ferdge_app` for the app.

## Verification

Run the script (with `DATABASE_URL` as `ferdge_app` after migrations):

```bash
npx ts-node scripts/verify-rls.ts
```

It checks:
1. With context set to Org A: `findMany` with **no** `where` returns only Org A's jobs.
2. With context set to Org B: `findMany` with **no** `where` returns no rows from Org A.
3. With **no** context (plain transaction, no `set_config`): `findMany` returns 0 rows.

So even if the application code omits `where: { companyId }`, the DB still denies cross-org rows.
