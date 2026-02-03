/**
 * Milestone 2B: RLS verification script.
 *
 * Proves that:
 * 1. Correct org can read/write when app.current_org_id is set.
 * 2. Wrong org (or missing context) cannot see other org's rows even without WHERE filter.
 *
 * Run from project root after migrations and seed:
 *   npx ts-node scripts/verify-rls.ts
 * Requires DATABASE_URL (use .env or export DATABASE_URL).
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

async function main() {
  await prisma.$connect();

  // Get two orgs and a job in org 1 from seed
  const companies = await prisma.company.findMany({ take: 2, orderBy: { id: 'asc' } });
  if (companies.length < 2) {
    console.log('Need at least 2 companies (run seed). Skipping RLS verification.');
    await prisma.$disconnect();
    return;
  }

  const [orgA, orgB] = companies;
  let jobInA = await prisma.job.findFirst({ where: { companyId: orgA.id }, select: { id: true, title: true, companyId: true } });
  if (!jobInA) {
    // Create one job in org A so we have data to isolate
    jobInA = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        "SELECT set_config('app.current_org_id', $1, true)",
        String(orgA.id),
      );
      return tx.job.create({
        data: {
          title: 'RLS verification job',
          experience: 'MID',
          employmentType: 'LONG_TERM',
          workArrangement: 'REMOTE',
          responsibilities: [],
          requirements: [],
          niceToHave: [],
          perks: [],
          whoYouAre: [],
          tags: [],
          companyId: orgA.id,
        },
        select: { id: true, title: true, companyId: true },
      });
    });
    console.log('Created a job in org A for verification.');
  }

  console.log('--- RLS verification ---');
  console.log('Org A id:', orgA.id, '| Org B id:', orgB.id, '| Job in A:', jobInA.id);

  // 1) With org context set to A: findMany with NO where should return only A's jobs
  const withContextA = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_org_id', $1, true)",
      String(orgA.id),
    );
    return tx.job.findMany({ select: { id: true, companyId: true } });
  });
  const allInA = withContextA.every((j) => j.companyId === orgA.id);
  console.log('\n1) runWithOrgContext(orgA): findMany (no where) returned', withContextA.length, 'rows.');
  console.log('   All rows have companyId === orgA?', allInA ? 'YES' : 'NO');
  if (!allInA) {
    console.error('   FAIL: RLS should restrict to org A only.');
    process.exit(1);
  }

  // 2) With org context set to B: findMany with NO where should return only B's jobs (and not A's job)
  const withContextB = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      "SELECT set_config('app.current_org_id', $1, true)",
      String(orgB.id),
    );
    return tx.job.findMany({ select: { id: true, companyId: true } });
  });
  const noneFromA = withContextB.every((j) => j.companyId === orgB.id);
  const leakedFromA = withContextB.some((j) => j.companyId === orgA.id);
  console.log('\n2) runWithOrgContext(orgB): findMany (no where) returned', withContextB.length, 'rows.');
  console.log('   No rows from org A?', !leakedFromA ? 'YES' : 'NO');
  if (leakedFromA) {
    console.error('   FAIL: RLS should block org A rows when context is org B.');
    process.exit(1);
  }

  // 3) Direct findMany WITHOUT runWithOrgContext: app.current_org_id is not set -> RLS should return 0 rows (NULL = no match)
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
