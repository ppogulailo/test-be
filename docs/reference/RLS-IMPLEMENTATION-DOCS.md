# Milestone 2B: RLS Implementation Documentation

## Overview

This document explains how Row Level Security (RLS) is implemented in the application to provide hard tenant isolation at the database layer.

---

## 1. What is RLS and Why?

**Row Level Security (RLS)** is a PostgreSQL feature that allows database-level enforcement of access control policies on table rows. Unlike application-level filtering (e.g., `WHERE companyId = currentOrgId`), RLS policies are enforced by PostgreSQL itself, making them impossible to bypass even if application code has bugs or forgets to add filters.

### Benefits:
- ✅ **Defense in depth**: Even if application code forgets `WHERE` clauses, data stays isolated
- ✅ **Audit compliance**: Database enforces multi-tenancy, not just application
- ✅ **Security**: Cannot bypass via raw SQL, ORM bugs, or compromised app code
- ✅ **Peace of mind**: One place to verify isolation (database) vs. thousands of queries

---

## 2. Which Tables are Protected

Currently, RLS is enabled on the following org-scoped tables:

| Table | Purpose | Isolation Field |
|-------|---------|-----------------|
| `Job` | Job postings | `companyId` |
| `Application` | Candidate applications | `companyId` |

### Future Tables (Milestone 2B Extension):
- `CandidateProfile` (for client-side viewing)
- `Interview`
- `ChatMessage` (via conversation → org)
- `Notification` (via recipient → org)
- `TalentPool`

---

## 3. How RLS Context is Set

### The Context Variable: `app.current_org_id`

RLS policies check the value of a PostgreSQL session variable called `app.current_org_id`. This variable is set at the start of every transaction to identify which organization the current request belongs to.

### Setting the Context: `PrismaService.runWithOrgContext()`

All org-scoped database operations must be wrapped in `runWithOrgContext()`:

```typescript
// src/prisma/prisma.service.ts

async runWithOrgContext<T>(
  orgId: number | string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const orgIdStr = String(orgId);
  return this.$transaction(async (tx) => {
    // Set the RLS context variable for this transaction
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_org_id', $1, true)",
      orgIdStr,
    );
    // Execute the user's code within this transaction
    return fn(tx);
  });
}
```

**Key Points:**
- Context is set per-transaction (not per-connection)
- The third parameter `true` makes it transaction-local (resets after transaction)
- All queries within the transaction callback see only the specified org's data

### Usage in Controllers/Services:

```typescript
// CORRECT: Wrapped in runWithOrgContext
async findJobsForOrg(orgId: number) {
  return this.prisma.runWithOrgContext(orgId, async (tx) => {
    // This query only sees jobs from orgId, even without WHERE clause!
    return tx.job.findMany();
  });
}

// WRONG: Will fail or return nothing (no context)
async findJobsWrong(orgId: number) {
  return this.prisma.job.findMany({
    where: { companyId: orgId }  // RLS will block this!
  });
}
```

---

## 4. RLS Policy Structure

Each protected table has 4 policies (one per operation):

### Example: Job Table Policies

```sql
-- Enable RLS on the table
ALTER TABLE "Job" ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (no bypass)
ALTER TABLE "Job" FORCE ROW LEVEL SECURITY;

-- SELECT: Only see rows where companyId matches current org
CREATE POLICY "Job_select_org" ON "Job"
  FOR SELECT
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

-- INSERT: Only insert rows for current org
CREATE POLICY "Job_insert_org" ON "Job"
  FOR INSERT
  WITH CHECK ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

-- UPDATE: Only update rows for current org
CREATE POLICY "Job_update_org" ON "Job"
  FOR UPDATE
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer))
  WITH CHECK ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));

-- DELETE: Only delete rows for current org
CREATE POLICY "Job_delete_org" ON "Job"
  FOR DELETE
  USING ("companyId" = (NULLIF(current_setting('app.current_org_id', true), '')::integer));
```

### Policy Breakdown:

**USING clause**: Determines which rows are visible for SELECT, UPDATE, DELETE
**WITH CHECK clause**: Validates rows for INSERT and UPDATE

The expression `NULLIF(current_setting('app.current_org_id', true), '')::integer`:
- `current_setting('app.current_org_id', true)` - Gets the context variable (returns '' if not set)
- `NULLIF(..., '')` - Converts empty string to NULL
- `::integer` - Casts to integer (NULL if empty)
- Result: If no context is set, `companyId = NULL` which never matches → no rows visible

---

## 5. Migration Files

RLS is applied via Prisma migrations:

### Migration 1: Enable RLS and Create Policies
**File**: `prisma/migrations/20260203120000_rls_org_isolation/migration.sql`

Enables RLS on `Job` and `Application` tables and creates all 4 policies for each.

### Migration 2: Force RLS (No Bypass)
**File**: `prisma/migrations/20260203120001_rls_force_row_level_security/migration.sql`

Applies `FORCE ROW LEVEL SECURITY` so even the table owner (your app's DB user) cannot bypass RLS.

### Migration 3: Application Role
**File**: `prisma/migrations/20260203120002_rls_app_role/migration.sql`

Creates a dedicated `ferdge_app` role with `NOBYPASSRLS` and grants it table permissions. This ensures the app cannot circumvent RLS.

---

## 6. Request Flow

### Typical Request Lifecycle:

```
1. User makes request to API
   ↓
2. JwtAuthGuard validates token, extracts userId
   ↓
3. OrgContextGuard resolves user's current organization
   ↓
4. Request context (req.authContext) includes currentOrgId
   ↓
5. Controller calls service with currentOrgId
   ↓
6. Service calls prisma.runWithOrgContext(currentOrgId, ...)
   ↓
7. PrismaService opens transaction and sets app.current_org_id
   ↓
8. All queries in transaction are filtered by RLS policies
   ↓
9. Transaction commits, context is reset
   ↓
10. Response returned to user
```

### Code Flow Example:

```typescript
// 1. Controller receives request
@Get(':id')
@UseGuards(JwtAuthGuard, OrgContextGuard)
async getJob(
  @Param('id') id: string,
  @Req() req: RequestWithAuth,
) {
  const { currentOrgId } = req.authContext;
  
  // 2. Service uses RLS context
  return this.jobsService.findOne(Number(id), { 
    companyId: Number(currentOrgId) 
  });
}

// 3. Service method
async findOne(jobId: number, ctx: JobScopeContext) {
  return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
    // 4. This query is automatically filtered by RLS!
    // Even if we forget WHERE clause, RLS blocks other orgs
    return tx.job.findUnique({ where: { id: jobId } });
  });
}
```

---

## 7. Testing RLS

### Automated Tests

Run the test suite:
```bash
cd backend-fer
npm run test src/common/rls/rls-verification.spec.ts
```

### Verification Script

Run the standalone verification:
```bash
cd backend-fer
npx ts-node scripts/verify-rls.ts
```

### Manual Database Testing

```bash
psql -U your_user -d your_database

-- Verify RLS is enabled
SELECT tablename, rowsecurity, relforcerowsecurity 
FROM pg_tables t
JOIN pg_class c ON c.relname = t.tablename
WHERE tablename IN ('Job', 'Application');

-- Set context to Org 1
SET app.current_org_id = '1';
SELECT count(*) FROM "Job";

-- Switch to Org 2
SET app.current_org_id = '2';
SELECT count(*) FROM "Job";

-- Try to see all jobs (should fail/return nothing)
RESET app.current_org_id;
SELECT count(*) FROM "Job";
```

---

## 8. Common Patterns

### Pattern 1: Simple Read

```typescript
async getJobs(orgId: number) {
  return this.prisma.runWithOrgContext(orgId, async (tx) => {
    return tx.job.findMany({
      where: { status: 'OPEN' }  // No companyId needed!
    });
  });
}
```

### Pattern 2: Create with Validation

```typescript
async createJob(orgId: number, dto: CreateJobDto) {
  return this.prisma.runWithOrgContext(orgId, async (tx) => {
    // RLS ensures companyId matches orgId
    return tx.job.create({
      data: {
        ...dto,
        companyId: orgId,  // RLS will reject if mismatched
      },
    });
  });
}
```

### Pattern 3: Update with Access Check

```typescript
async updateJob(jobId: number, orgId: number, dto: UpdateJobDto) {
  return this.prisma.runWithOrgContext(orgId, async (tx) => {
    // RLS automatically ensures job belongs to orgId
    return tx.job.update({
      where: { id: jobId },
      data: dto,
    });
  });
}
```

### Pattern 4: Complex Query with Relations

```typescript
async getJobsWithApplications(orgId: number) {
  return this.prisma.runWithOrgContext(orgId, async (tx) => {
    return tx.job.findMany({
      include: {
        applications: true,  // RLS applies to both tables!
      },
    });
  });
}
```

---

## 9. Troubleshooting

### Issue: "Record not found" when it should exist

**Cause**: Likely querying outside `runWithOrgContext()` or with wrong orgId

**Fix**:
```typescript
// WRONG
const job = await this.prisma.job.findUnique({ where: { id } });

// CORRECT
const job = await this.prisma.runWithOrgContext(orgId, async (tx) => {
  return tx.job.findUnique({ where: { id } });
});
```

### Issue: "Cannot insert - policy violation"

**Cause**: Trying to insert a row with `companyId` that doesn't match context

**Fix**: Ensure `companyId` in data matches `orgId` in `runWithOrgContext()`

### Issue: Queries return 0 rows for admin/superuser

**Cause**: PostgreSQL superusers bypass RLS by default

**Fix**: Use `FORCE ROW LEVEL SECURITY` (already applied in migrations)

### Issue: Context not persisting across multiple queries

**Cause**: Context is transaction-local. Multiple separate queries won't share context.

**Fix**: Wrap all related queries in a single `runWithOrgContext()` call:

```typescript
// WRONG: Context lost between calls
const jobs = await this.prisma.runWithOrgContext(orgId, tx => tx.job.findMany());
const apps = await this.prisma.runWithOrgContext(orgId, tx => tx.application.findMany());

// CORRECT: Single transaction
const result = await this.prisma.runWithOrgContext(orgId, async (tx) => {
  const jobs = await tx.job.findMany();
  const apps = await tx.application.findMany();
  return { jobs, apps };
});
```

---

## 10. Security Considerations

### ✅ What RLS Protects Against:

- Application bugs that forget WHERE filters
- ORM query builder errors
- Raw SQL injection that bypasses ORM
- Compromised application code
- Admin/support users accidentally accessing wrong org

### ⚠️ What RLS Does NOT Protect Against:

- **Authentication bypass**: RLS assumes orgId is correctly determined
- **Authorization logic**: RLS doesn't enforce role permissions (use RBAC guards)
- **API endpoint access**: RLS doesn't prevent accessing endpoints (use route guards)
- **Vertical privilege escalation**: RLS doesn't prevent users escalating within their org

### Best Practices:

1. **Always use `runWithOrgContext()`** for org-scoped operations
2. **Validate orgId** from authenticated user's session/token
3. **Log context switches** for audit trails
4. **Test with multiple orgs** in development
5. **Monitor for RLS errors** in production (indicates bugs)
6. **Document which tables** are RLS-protected vs. global
7. **Don't bypass RLS** even for "trusted" operations (no shortcuts!)

---

## 11. Performance Considerations

### RLS Impact:

- **Minimal overhead**: RLS policies are simple equality checks
- **Index-friendly**: `companyId` should have an index (usually part of primary key)
- **No N+1 queries**: RLS applies at row level, not query level
- **Transaction-scoped**: Context setting is once per transaction

### Optimization:

```sql
-- Ensure index exists on isolation column
CREATE INDEX IF NOT EXISTS idx_job_company_id ON "Job"("companyId");
CREATE INDEX IF NOT EXISTS idx_application_company_id ON "Application"("companyId");
```

### Monitoring:

```sql
-- Check slow queries with RLS
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
WHERE query LIKE '%Job%' OR query LIKE '%Application%'
ORDER BY mean_exec_time DESC
LIMIT 10;
```

---

## Summary

✅ **RLS is enabled** on `Job` and `Application` tables  
✅ **Policies enforce** isolation using `app.current_org_id`  
✅ **Context is set** via `PrismaService.runWithOrgContext()`  
✅ **Even raw SQL** is protected by RLS  
✅ **Forgetting WHERE clauses** doesn't leak data  
✅ **Table owners** cannot bypass (FORCE RLS)  
✅ **Tests verify** isolation works correctly  

**Milestone 2B Achievement**: Hard tenant isolation at the database layer, making cross-org data leaks architecturally impossible.
