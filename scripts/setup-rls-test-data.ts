#!/usr/bin/env ts-node
/**
 * Setup Test Data for RLS Verification
 * 
 * Creates 2 test organizations with jobs to enable RLS testing.
 * Run this before running RLS verification tests.
 * 
 * Usage: npx ts-node scripts/setup-rls-test-data.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

// Initialize Prisma with proper configuration (similar to PrismaService)
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n❌ DATABASE_URL environment variable is not set!');
  console.error('\nPlease ensure you have a .env file in backend-fer/ with:');
  console.error('  DATABASE_URL="postgresql://user:password@localhost:5432/dbname"\n');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function setupTestData() {
  console.log('📦 Setting up RLS test data...\n');

  try {
    // Create or get Org 1
    let org1 = await prisma.company.findFirst({
      where: { name: 'RLS Test Org 1' },
    });

    if (!org1) {
      org1 = await prisma.company.create({
        data: {
          name: 'RLS Test Org 1',
          description: 'Test organization for RLS verification',
        },
      });
      console.log(`✅ Created Org 1: ${org1.name} (ID: ${org1.id})`);
    } else {
      console.log(`ℹ️  Org 1 already exists: ${org1.name} (ID: ${org1.id})`);
    }

    // Create or get Org 2
    let org2 = await prisma.company.findFirst({
      where: { name: 'RLS Test Org 2' },
    });

    if (!org2) {
      org2 = await prisma.company.create({
        data: {
          name: 'RLS Test Org 2',
          description: 'Test organization for RLS verification',
        },
      });
      console.log(`✅ Created Org 2: ${org2.name} (ID: ${org2.id})`);
    } else {
      console.log(`ℹ️  Org 2 already exists: ${org2.name} (ID: ${org2.id})`);
    }

    // Create users for each org
    const user1Email = 'rls-test-user-1@example.com';
    let user1 = await prisma.user.findUnique({
      where: { email: user1Email },
    });

    if (!user1) {
      user1 = await prisma.user.create({
        data: {
          email: user1Email,
          password: 'hashed_password_placeholder',
          type: 'TEAM_MEMBER',
        },
      });
      console.log(`✅ Created User 1: ${user1.email} (ID: ${user1.id})`);
    } else {
      console.log(`ℹ️  User 1 already exists: ${user1.email} (ID: ${user1.id})`);
    }

    const user2Email = 'rls-test-user-2@example.com';
    let user2 = await prisma.user.findUnique({
      where: { email: user2Email },
    });

    if (!user2) {
      user2 = await prisma.user.create({
        data: {
          email: user2Email,
          password: 'hashed_password_placeholder',
          type: 'TEAM_MEMBER',
        },
      });
      console.log(`✅ Created User 2: ${user2.email} (ID: ${user2.id})`);
    } else {
      console.log(`ℹ️  User 2 already exists: ${user2.email} (ID: ${user2.id})`);
    }

    // Create memberships
    const membership1 = await prisma.organizationMembership.findFirst({
      where: { userId: user1.id, companyId: org1.id },
    });

    if (!membership1) {
      await prisma.organizationMembership.create({
        data: {
          userId: user1.id,
          companyId: org1.id,
          isActive: true,
        },
      });
      console.log(`✅ Created membership: User 1 → Org 1`);
    }

    const membership2 = await prisma.organizationMembership.findFirst({
      where: { userId: user2.id, companyId: org2.id },
    });

    if (!membership2) {
      await prisma.organizationMembership.create({
        data: {
          userId: user2.id,
          companyId: org2.id,
          isActive: true,
        },
      });
      console.log(`✅ Created membership: User 2 → Org 2`);
    }

    // Create jobs for Org 1 (using RLS context)
    console.log('\n📝 Creating jobs for Org 1...');
    
    // Check if job already exists
    const existingOrg1Jobs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
      return tx.job.findMany({
        where: { title: { contains: 'RLS Test - Org 1' } },
      });
    });

    if (existingOrg1Jobs.length === 0) {
      const job1 = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
        return tx.job.create({
          data: {
            title: 'RLS Test - Org 1 Senior Developer',
            companyId: org1.id,
            status: 'LIVE',
            experience: 'SENIOR',
            employmentType: 'LONG_TERM',
            workArrangement: 'REMOTE',
            location: 'Remote',
            responsibilities: null,
            requirements: null,
            niceToHave: [],
            perks: null,
            whoYouAre: [],
            tags: [],
          },
        });
      });
      console.log(`   ✅ Created job: ${job1.title} (ID: ${job1.id})`);

      const job2 = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
        return tx.job.create({
          data: {
            title: 'RLS Test - Org 1 Frontend Developer',
            companyId: org1.id,
            status: 'LIVE',
            experience: 'MID',
            employmentType: 'LONG_TERM',
            workArrangement: 'HYBRID',
            location: 'New York',
            responsibilities: null,
            requirements: null,
            niceToHave: [],
            perks: null,
            whoYouAre: [],
            tags: [],
          },
        });
      });
      console.log(`   ✅ Created job: ${job2.title} (ID: ${job2.id})`);
    } else {
      console.log(`   ℹ️  Org 1 already has ${existingOrg1Jobs.length} test jobs`);
    }

    // Create jobs for Org 2 (using RLS context)
    console.log('\n📝 Creating jobs for Org 2...');
    
    const existingOrg2Jobs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org2.id}', true)`);
      return tx.job.findMany({
        where: { title: { contains: 'RLS Test - Org 2' } },
      });
    });

    if (existingOrg2Jobs.length === 0) {
      const job3 = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org2.id}', true)`);
        return tx.job.create({
          data: {
            title: 'RLS Test - Org 2 Data Analyst',
            companyId: org2.id,
            status: 'LIVE',
            experience: 'JUNIOR',
            employmentType: 'LONG_TERM',
            workArrangement: 'ON_SITE',
            location: 'London',
            responsibilities: null,
            requirements: null,
            niceToHave: [],
            perks: null,
            whoYouAre: [],
            tags: [],
          },
        });
      });
      console.log(`   ✅ Created job: ${job3.title} (ID: ${job3.id})`);

      const job4 = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org2.id}', true)`);
        return tx.job.create({
          data: {
            title: 'RLS Test - Org 2 Financial Analyst',
            companyId: org2.id,
            status: 'LIVE',
            experience: 'SENIOR',
            employmentType: 'LONG_TERM',
            workArrangement: 'ON_SITE',
            location: 'London',
            responsibilities: null,
            requirements: null,
            niceToHave: [],
            perks: null,
            whoYouAre: [],
            tags: [],
          },
        });
      });
      console.log(`   ✅ Created job: ${job4.title} (ID: ${job4.id})`);
    } else {
      console.log(`   ℹ️  Org 2 already has ${existingOrg2Jobs.length} test jobs`);
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n✨ RLS Test Data Setup Complete!\n');
    console.log('📊 Summary:');
    console.log(`   Org 1: ${org1.name} (ID: ${org1.id})`);
    console.log(`   Org 2: ${org2.name} (ID: ${org2.id})`);
    console.log(`   User 1: ${user1.email}`);
    console.log(`   User 2: ${user2.email}`);

    // Count jobs per org
    const org1JobCount = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
      return tx.job.count();
    });

    const org2JobCount = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org2.id}', true)`);
      return tx.job.count();
    });

    console.log(`   Org 1 Jobs: ${org1JobCount}`);
    console.log(`   Org 2 Jobs: ${org2JobCount}`);

    console.log('\n✅ Ready for RLS testing!');
    console.log('\nNext steps:');
    console.log('   1. Run verification: npx ts-node scripts/verify-rls.ts');
    console.log('   2. Run test suite: npm run test -- rls-verification.spec.ts');
    console.log('');

  } catch (error) {
    console.error('\n❌ Setup failed:', error);
    console.log('\nPlease ensure:');
    console.log('  1. Database is running');
    console.log('  2. Migrations are applied (npm run prisma:migrate:dev)');
    console.log('  3. DATABASE_URL is correctly configured\n');
  } finally {
    await prisma.$disconnect();
  }
}

// Run setup
setupTestData();
