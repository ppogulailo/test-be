/**
 * Milestone 2B: RLS verification script.
 * Proves that (1) correct org can read/write, (2) wrong org gets no rows, (3) no context → no rows.
 *
 * Run with DATABASE_URL pointing at the ferdge_app role (RLS is not applied for superuser/bypass roles).
 * Migrations must be run as the table owner first; then switch to ferdge_app for this script.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Prisma } from '@prisma/client';
import { ExperienceLevel, EmploymentType, WorkArrangement, JobStatus } from '@prisma/client';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

async function runWithOrgContext<T>(
  orgId: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_org_id', $1, true)",
      String(orgId),
    );
    return fn(tx);
  });
}

async function main() {
  await prisma.$connect();

  const bypassCheck = await prisma.$queryRaw<[{ bypass: boolean }]>`
    SELECT (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypass
  `.then((r) => r[0]);
  if (bypassCheck?.bypass) {
    console.error('Current DB user bypasses RLS. RLS verification would be meaningless.');
    console.error('Use the ferdge_app role in DATABASE_URL (run migrations as table owner first).');
    process.exit(1);
  }

  const companies = await prisma.company.findMany({ take: 2, orderBy: { id: 'asc' } });
  if (companies.length < 2) {
    console.error('Need at least 2 companies. Run seed: npm run db:seed');
    process.exit(1);
  }
  const [orgA, orgB] = companies;

  const jobInA = await runWithOrgContext(orgA.id, (tx) =>
    tx.job.create({
      data: {
        title: 'RLS verify job',
        experience: ExperienceLevel.MID,
        employmentType: EmploymentType.LONG_TERM,
        workArrangement: WorkArrangement.REMOTE,
        responsibilities: [],
        requirements: [],
        niceToHave: [],
        perks: [],
        whoYouAre: [],
        tags: [],
        companyId: orgA.id,
        status: JobStatus.DRAFT,
      },
      select: { id: true, companyId: true },
    }),
  );

  console.log('--- RLS verification ---');
  console.log('Org A id:', orgA.id, '| Org B id:', orgB.id, '| Job in A:', jobInA.id);

  const withContextA = await runWithOrgContext(orgA.id, (tx) =>
    tx.job.findMany({ select: { id: true, companyId: true } }),
  );
  const allFromA = withContextA.every((j) => j.companyId === orgA.id);
  console.log('\n1) runWithOrgContext(orgA): findMany (no where) returned', withContextA.length, 'rows.');
  console.log('   All rows have companyId === orgA?', allFromA ? 'YES' : 'NO');
  if (!allFromA) {
    console.error('   FAIL: RLS should only return org A rows when context is org A.');
    process.exit(1);
  }

  const withContextB = await runWithOrgContext(orgB.id, (tx) =>
    tx.job.findMany({ select: { id: true, companyId: true } }),
  );
  const leakedFromA = withContextB.some((j) => j.companyId === orgA.id);
  console.log('\n2) runWithOrgContext(orgB): findMany (no where) returned', withContextB.length, 'rows.');
  console.log('   No rows from org A?', !leakedFromA ? 'YES' : 'NO');
  if (leakedFromA) {
    console.error('   FAIL: RLS should block org A rows when context is org B.');
    process.exit(1);
  }

  const noContext = await prisma.$transaction(async (tx) => {
    return tx.job.findMany({ select: { id: true, companyId: true } });
  });
  console.log('\n3) findMany in plain transaction (no set_config): returned', noContext.length, 'rows.');
  console.log('   Zero rows when context not set?', noContext.length === 0 ? 'YES' : 'NO');
  if (noContext.length > 0) {
    console.error('   FAIL: When app.current_org_id is not set, RLS should allow no rows.');
    process.exit(1);
  }

  console.log('\n--- RLS verification passed. ---');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
