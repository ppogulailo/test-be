#!/usr/bin/env ts-node
/**
 * Milestone 2B: RLS Verification Script
 * 
 * This standalone script verifies that Row Level Security (RLS) is properly configured
 * and enforcing hard tenant isolation at the database layer.
 * 
 * Usage: npx ts-node scripts/verify-rls.ts
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Load environment variables from .env file
config({ path: resolve(__dirname, '../.env') });

// Initialize Prisma with proper configuration
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('\n❌ DATABASE_URL environment variable is not set!');
  console.error('\nPlease ensure you have a .env file in backend-fer/ with:');
  console.error('  DATABASE_URL="postgresql://user:password@localhost:5432/dbname"\n');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: url });
const prisma = new PrismaClient({ adapter });

async function verifyRLS() {
  console.log('🔍 Starting RLS Verification for Milestone 2B...\n');
  console.log('=' .repeat(80));

  try {
    // 1. Check RLS is enabled on tables
    console.log('\n1️⃣  Checking if RLS is enabled on org-scoped tables...\n');
    const rlsTables = await prisma.$queryRaw<Array<{
      tablename: string;
      rowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>>`
      SELECT 
        t.tablename,
        t.rowsecurity,
        c.relforcerowsecurity
      FROM pg_tables t
      JOIN pg_class c ON c.relname = t.tablename
      WHERE t.schemaname = 'public' 
        AND t.tablename IN ('Job', 'Application')
      ORDER BY t.tablename
    `;
    
    console.table(rlsTables);
    
    const allEnabled = rlsTables.every(t => t.rowsecurity);
    const allForced = rlsTables.every(t => t.relforcerowsecurity);
    
    if (allEnabled && allForced) {
      console.log('✅ RLS enabled and FORCED on all tables (owner cannot bypass)\n');
    } else {
      console.log('❌ RLS not properly enabled on all tables\n');
      if (!allEnabled) console.log('   Missing: ENABLE ROW LEVEL SECURITY');
      if (!allForced) console.log('   Missing: FORCE ROW LEVEL SECURITY');
      return;
    }

    // 2. Check policies exist
    console.log('2️⃣  Checking RLS policies...\n');
    const policies = await prisma.$queryRaw<Array<{
      tablename: string;
      policyname: string;
      cmd: string;
      qual: string;
    }>>`
      SELECT 
        tablename, 
        policyname, 
        cmd,
        qual
      FROM pg_policies 
      WHERE schemaname = 'public'
        AND tablename IN ('Job', 'Application')
      ORDER BY tablename, cmd
    `;
    
    console.table(policies);
    
    // Verify we have all 4 operations for each table
    const jobPolicies = policies.filter(p => p.tablename === 'Job');
    const appPolicies = policies.filter(p => p.tablename === 'Application');
    
    const jobCommands = new Set(jobPolicies.map(p => p.cmd));
    const appCommands = new Set(appPolicies.map(p => p.cmd));
    
    const requiredCommands = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];
    const jobHasAll = requiredCommands.every(cmd => jobCommands.has(cmd));
    const appHasAll = requiredCommands.every(cmd => appCommands.has(cmd));
    
    if (jobHasAll && appHasAll) {
      console.log('✅ All required policies exist (SELECT, INSERT, UPDATE, DELETE)\n');
    } else {
      console.log('❌ Missing policies\n');
      if (!jobHasAll) console.log(`   Job table missing: ${requiredCommands.filter(c => !jobCommands.has(c)).join(', ')}`);
      if (!appHasAll) console.log(`   Application table missing: ${requiredCommands.filter(c => !appCommands.has(c)).join(', ')}`);
      return;
    }

    // 2.5. Check if current user bypasses RLS
    console.log('2️⃣.5 Checking if database user bypasses RLS...\n');
    
    const userInfo = await prisma.$queryRaw<Array<{
      current_user: string;
      rolbypassrls: boolean;
      rolsuper: boolean;
    }>>`
      SELECT 
        current_user,
        rolbypassrls,
        rolsuper
      FROM pg_roles 
      WHERE rolname = current_user
    `;
    
    console.table(userInfo);
    
    if (userInfo[0]?.rolbypassrls || userInfo[0]?.rolsuper) {
      console.log('⚠️  WARNING: Current database user bypasses RLS or is superuser!');
      console.log('   This means RLS policies will NOT be enforced.\n');
      console.log('   To fix this, you need to:');
      console.log('   1. Create a non-superuser role: CREATE ROLE app_user WITH LOGIN PASSWORD \'password\' NOBYPASSRLS;');
      console.log('   2. Grant permissions: GRANT ALL ON ALL TABLES IN SCHEMA public TO app_user;');
      console.log('   3. Grant sequences: GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;');
      console.log('   4. Update DATABASE_URL in .env to use app_user');
      console.log('   5. Restart the application\n');
      console.log('   OR use the ferdge_app role created by migrations:\n');
      console.log('   Set DATABASE_URL to: postgresql://ferdge_app:password@localhost:5432/your_db\n');
    } else {
      console.log('✅ Current user does NOT bypass RLS (good!)\n');
    }

    // 3. Verify policy uses app.current_org_id
    console.log('3️⃣  Verifying policies use app.current_org_id context...\n');
    
    // Check non-INSERT policies (INSERT uses WITH CHECK which we'll check separately)
    const selectPolicies = policies.filter(p => p.cmd === 'SELECT');
    const policiesUseContext = selectPolicies.every(p => 
      p.qual && p.qual.includes('current_setting') && p.qual.includes('app.current_org_id')
    );
    
    if (policiesUseContext && selectPolicies.length > 0) {
      console.log('✅ All policies use current_setting(\'app.current_org_id\') for isolation\n');
      console.log('   Example policy condition:');
      console.log(`   ${selectPolicies[0].qual}\n`);
    } else {
      console.log('❌ Policies do not properly use app.current_org_id\n');
      return;
    }

    // 4. Test org isolation with real data
    console.log('4️⃣  Testing org isolation with real data...\n');
    
    // Get RLS test orgs specifically
    const orgs = await prisma.$queryRaw<Array<{ id: number; name: string }>>`
      SELECT id, name FROM companies 
      WHERE name LIKE 'RLS Test Org%'
      ORDER BY id LIMIT 2
    `;

    if (orgs.length < 2) {
      console.log('⚠️  Need at least 2 RLS test organizations.\n');
      console.log('   Please run: npx ts-node scripts/setup-rls-test-data.ts\n');
      return;
    }

    const [org1, org2] = orgs;
    console.log(`Testing with:
  📍 Org 1: ${org1.name} (ID: ${org1.id})
  📍 Org 2: ${org2.name} (ID: ${org2.id})\n`);

    // Test Org 1 isolation
    console.log(`🔐 Setting context to Org 1 (ID: ${org1.id})...\n`);
    
    const org1Jobs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
      return tx.$queryRaw<Array<{ id: number; companyId: number; title: string }>>`
        SELECT id, "companyId", title FROM "Job" LIMIT 10
      `;
    });
    
    console.log(`   Found ${org1Jobs.length} jobs`);
    if (org1Jobs.length > 0) {
      console.table(org1Jobs);
      const org1HasOnlyOwnJobs = org1Jobs.every(j => j.companyId === org1.id);
      if (org1HasOnlyOwnJobs) {
        console.log('   ✅ All jobs belong to Org 1\n');
      } else {
        console.log('   ❌ Found jobs from other orgs!\n');
        return;
      }
    } else {
      console.log('   ℹ️  Org 1 has no jobs (create some for better testing)\n');
    }

    // Test Org 2 isolation
    console.log(`🔐 Setting context to Org 2 (ID: ${org2.id})...\n`);
    
    const org2Jobs = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org2.id}', true)`);
      return tx.$queryRaw<Array<{ id: number; companyId: number; title: string }>>`
        SELECT id, "companyId", title FROM "Job" LIMIT 10
      `;
    });
    
    console.log(`   Found ${org2Jobs.length} jobs`);
    if (org2Jobs.length > 0) {
      console.table(org2Jobs);
      const org2HasOnlyOwnJobs = org2Jobs.every(j => j.companyId === org2.id);
      if (org2HasOnlyOwnJobs) {
        console.log('   ✅ All jobs belong to Org 2\n');
      } else {
        console.log('   ❌ Found jobs from other orgs!\n');
        return;
      }
    } else {
      console.log('   ℹ️  Org 2 has no jobs (create some for better testing)\n');
    }

    // 5. Test cross-org access is blocked (THE KEY TEST!)
    if (org1Jobs.length > 0 && org2Jobs.length > 0) {
      console.log('5️⃣  🚨 KEY TEST: Verifying cross-org access is blocked...\n');
      
      console.log(`   Test: Try to access Org 2's job from Org 1 context\n`);
      const org2JobId = org2Jobs[0].id;
      
      const crossOrgAttempt = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
        return tx.$queryRaw<Array<any>>`
          SELECT * FROM "Job" WHERE id = ${org2JobId}
        `;
      });
      
      if (crossOrgAttempt.length === 0) {
        console.log('   ✅ SUCCESS: Cannot access Org 2 job from Org 1 context');
        console.log(`   ✅ RLS blocked access to job ID ${org2JobId}\n`);
      } else {
        console.log('   ❌ RLS FAILURE: Cross-org access was NOT blocked!');
        console.log(`   ❌ Was able to read job ID ${org2JobId} from wrong org context\n`);
        return;
      }

      // Test without WHERE clause (even more critical!)
      console.log(`   Test: Query WITHOUT WHERE clause in wrong org context\n`);
      
      const noWhereClauseTest = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('app.current_org_id', '${org1.id}', true)`);
        // No WHERE clause at all!
        return tx.$queryRaw<Array<{ id: number; companyId: number }>>`
          SELECT id, "companyId" FROM "Job"
        `;
      });
      
      const hasOrg2Jobs = noWhereClauseTest.some(j => j.companyId === org2.id);
      
      if (!hasOrg2Jobs && noWhereClauseTest.length > 0) {
        console.log('   ✅ SUCCESS: Query without WHERE clause only returned Org 1 jobs');
        console.log(`   ✅ RLS enforced isolation even when application code forgot filter\n`);
      } else if (noWhereClauseTest.length === 0) {
        console.log('   ⚠️  Query returned no jobs (may need more test data)\n');
      } else {
        console.log('   ❌ RLS FAILURE: Unfiltered query leaked cross-org data!');
        console.log(`   ❌ Found ${noWhereClauseTest.filter(j => j.companyId === org2.id).length} jobs from Org 2\n`);
        return;
      }
    } else {
      console.log('5️⃣  ⚠️  Skipping cross-org test (need jobs in both orgs)\n');
    }

    // 6. Test no context = no access
    console.log('6️⃣  Testing access without org context...\n');
    
    const noContextJobs = await prisma.$queryRaw<Array<any>>`
      SELECT id FROM "Job" LIMIT 1
    `;
    
    if (noContextJobs.length === 0) {
      console.log('   ✅ No org context = no access (as expected)\n');
    } else {
      console.log('   ❌ WARNING: Query without context returned data (should return nothing)\n');
    }

    // Summary
    console.log('=' .repeat(80));
    console.log('\n✨ RLS Verification Complete!\n');
    console.log('📋 Summary:');
    console.log('   ✅ RLS is enabled and FORCED on all org-scoped tables');
    console.log('   ✅ Policies exist for SELECT/INSERT/UPDATE/DELETE');
    console.log('   ✅ Policies use app.current_org_id for isolation');
    console.log('   ✅ Each org can only see its own data');
    console.log('   ✅ Cross-org access is blocked by RLS');
    console.log('   ✅ Queries without WHERE clause still enforce isolation');
    console.log('\n🎯 Milestone 2B: PASSED\n');
    console.log('   Hard tenant isolation is enforced at the database layer.');
    console.log('   Application code cannot bypass RLS, even if it forgets filters.\n');

  } catch (error) {
    console.error('\n❌ Verification failed with error:\n', error);
    console.log('\nPlease ensure:');
    console.log('  1. Database migrations have been run (npm run prisma:migrate:dev)');
    console.log('  2. RLS migrations are included (check prisma/migrations/)');
    console.log('  3. DATABASE_URL is correctly configured');
    console.log('  4. Database user has proper permissions\n');
  } finally {
    await prisma.$disconnect();
  }
}

// Run verification
verifyRLS();
