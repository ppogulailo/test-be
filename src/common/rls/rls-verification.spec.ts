import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';

/**
 * Milestone 2B: RLS Hard Isolation Tests
 * 
 * These tests verify that Row Level Security (RLS) provides hard tenant isolation
 * at the database layer, making it impossible to access data across organizations
 * even if application code forgets to add WHERE filters.
 * 
 * Key Test: Removing `where: { companyId }` still prevents cross-org data access.
 */
describe('RLS Hard Isolation Tests (Milestone 2B)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  
  // Test data
  let org1Id: number;
  let org2Id: number;
  let org1JobId: number;
  let org2JobId: number;
  let org1UserId: number;
  let org2UserId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    
    prisma = app.get(PrismaService);
    
    // Setup test data
    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await app.close();
  });

  async function setupTestData() {
    console.log('📦 Setting up test data...');
    
    // Create Org 1
    const org1 = await prisma.organization.create({
      data: {
        name: 'RLS Test Org 1',
        industry: 'Technology',
      },
    });
    org1Id = org1.id;

    // Create Org 2
    const org2 = await prisma.organization.create({
      data: {
        name: 'RLS Test Org 2',
        industry: 'Finance',
      },
    });
    org2Id = org2.id;

    // Create users
    const user1 = await prisma.user.create({
      data: {
        email: `rls-test-1-${Date.now()}@example.com`,
        role: 'client',
      },
    });
    org1UserId = user1.id;

    const user2 = await prisma.user.create({
      data: {
        email: `rls-test-2-${Date.now()}@example.com`,
        role: 'client',
      },
    });
    org2UserId = user2.id;

    // Create memberships
    await prisma.organizationMembership.create({
      data: {
        userId: org1UserId,
        companyId: org1Id,
        isActive: true,
      },
    });

    await prisma.organizationMembership.create({
      data: {
        userId: org2UserId,
        companyId: org2Id,
        isActive: true,
      },
    });

    // Create job for Org 1 (using RLS context)
    await prisma.runWithOrgContext(org1Id, async (tx) => {
      const job1 = await tx.job.create({
        data: {
          title: 'RLS Test - Org 1 Senior Developer',
          companyId: org1Id,
          status: 'OPEN',
          experience: 'Senior',
        },
      });
      org1JobId = job1.id;
    });

    // Create job for Org 2 (using RLS context)
    await prisma.runWithOrgContext(org2Id, async (tx) => {
      const job2 = await tx.job.create({
        data: {
          title: 'RLS Test - Org 2 Senior Developer',
          companyId: org2Id,
          status: 'OPEN',
          experience: 'Senior',
        },
      });
      org2JobId = job2.id;
    });

    console.log(`✅ Test data created:
  Org 1: ${org1.name} (ID: ${org1Id}, Job ID: ${org1JobId})
  Org 2: ${org2.name} (ID: ${org2Id}, Job ID: ${org2JobId})`);
  }

  async function cleanupTestData() {
    console.log('🧹 Cleaning up test data...');
    
    // Cleanup in reverse order (with RLS context)
    if (org1JobId) {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        await tx.job.delete({ where: { id: org1JobId } }).catch(() => {});
      });
    }
    
    if (org2JobId) {
      await prisma.runWithOrgContext(org2Id, async (tx) => {
        await tx.job.delete({ where: { id: org2JobId } }).catch(() => {});
      });
    }
    
    if (org1UserId || org2UserId) {
      // Memberships and users are not RLS-protected, so we can delete directly
      await prisma.organizationMembership.deleteMany({
        where: { userId: { in: [org1UserId, org2UserId] } },
      }).catch(() => {});
      
      await prisma.user.deleteMany({
        where: { id: { in: [org1UserId, org2UserId] } },
      }).catch(() => {});
    }
    
    if (org1Id || org2Id) {
      await prisma.organization.deleteMany({
        where: { id: { in: [org1Id, org2Id] } },
      }).catch(() => {});
    }
  }

  describe('✅ Positive Tests - Correct Org Access', () => {
    it('should allow Org 1 to read its own jobs', async () => {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        const jobs = await tx.job.findMany({
          where: { companyId: org1Id },
        });
        
        expect(jobs.length).toBeGreaterThan(0);
        expect(jobs.every(j => j.companyId === org1Id)).toBe(true);
        
        // Verify our test job is included
        const ourJob = jobs.find(j => j.id === org1JobId);
        expect(ourJob).toBeDefined();
        expect(ourJob?.title).toContain('Org 1');
      });
    });

    it('should allow Org 2 to read its own jobs', async () => {
      await prisma.runWithOrgContext(org2Id, async (tx) => {
        const jobs = await tx.job.findMany({
          where: { companyId: org2Id },
        });
        
        expect(jobs.length).toBeGreaterThan(0);
        expect(jobs.every(j => j.companyId === org2Id)).toBe(true);
        
        // Verify our test job is included
        const ourJob = jobs.find(j => j.id === org2JobId);
        expect(ourJob).toBeDefined();
        expect(ourJob?.title).toContain('Org 2');
      });
    });

    it('should allow Org 1 to create a job', async () => {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        const job = await tx.job.create({
          data: {
            title: 'RLS Test - Job Creation',
            companyId: org1Id,
            status: 'DRAFT',
            experience: 'Junior',
          },
        });
        
        expect(job.companyId).toBe(org1Id);
        
        // Cleanup
        await tx.job.delete({ where: { id: job.id } });
      });
    });

    it('should allow Org 1 to update its own job', async () => {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        const updated = await tx.job.update({
          where: { id: org1JobId },
          data: { title: 'RLS Test - Updated Title' },
        });
        
        expect(updated.title).toBe('RLS Test - Updated Title');
        expect(updated.companyId).toBe(org1Id);
        
        // Restore original
        await tx.job.update({
          where: { id: org1JobId },
          data: { title: 'RLS Test - Org 1 Senior Developer' },
        });
      });
    });
  });

  describe('🔒 Negative Tests - Cross-Org Access Blocked', () => {
    it('🚨 KEY TEST: should NOT allow Org 1 to read Org 2 jobs even WITHOUT WHERE filter', async () => {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        // THIS IS THE CRITICAL TEST!
        // No where clause filtering by companyId!
        const jobs = await tx.job.findMany();
        
        // RLS should ensure we only see Org 1 jobs
        expect(jobs.every(j => j.companyId === org1Id)).toBe(true);
        expect(jobs.some(j => j.companyId === org2Id)).toBe(false);
        
        // Explicitly verify Org 2's job is NOT in results
        const org2Job = jobs.find(j => j.id === org2JobId);
        expect(org2Job).toBeUndefined();
        
        console.log(`    ✅ Verified: findMany() without WHERE clause returned ${jobs.length} jobs, all from Org 1`);
      });
    });

    it('should NOT allow Org 1 to read Org 2 job by ID', async () => {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        // Try to read Org 2's job while in Org 1 context
        const job = await tx.job.findUnique({
          where: { id: org2JobId },
        });
        
        // RLS should return null
        expect(job).toBeNull();
        console.log(`    ✅ Verified: findUnique(org2JobId) from Org 1 context returned null`);
      });
    });

    it('should NOT allow Org 2 to read Org 1 job by ID', async () => {
      await prisma.runWithOrgContext(org2Id, async (tx) => {
        const job = await tx.job.findUnique({
          where: { id: org1JobId },
        });
        
        expect(job).toBeNull();
        console.log(`    ✅ Verified: findUnique(org1JobId) from Org 2 context returned null`);
      });
    });

    it('should NOT allow Org 1 to update Org 2 job', async () => {
      await expect(async () => {
        await prisma.runWithOrgContext(org1Id, async (tx) => {
          await tx.job.update({
            where: { id: org2JobId },
            data: { title: 'HACKED TITLE' },
          });
        });
      }).rejects.toThrow();
      
      console.log(`    ✅ Verified: update(org2JobId) from Org 1 context threw error`);
    });

    it('should NOT allow Org 1 to delete Org 2 job', async () => {
      await expect(async () => {
        await prisma.runWithOrgContext(org1Id, async (tx) => {
          await tx.job.delete({
            where: { id: org2JobId },
          });
        });
      }).rejects.toThrow();
      
      console.log(`    ✅ Verified: delete(org2JobId) from Org 1 context threw error`);
    });

    it('🚨 should NOT allow raw query to bypass RLS', async () => {
      await prisma.runWithOrgContext(org1Id, async (tx) => {
        // Try raw SQL without WHERE clause
        const jobs = await tx.$queryRaw<Array<{ id: number; company_id: number }>>`
          SELECT id, company_id FROM "Job"
        `;
        
        // RLS should still apply to raw queries
        expect(jobs.every(j => j.company_id === org1Id)).toBe(true);
        expect(jobs.some(j => j.company_id === org2Id)).toBe(false);
        
        console.log(`    ✅ Verified: Raw SQL query returned ${jobs.length} jobs, all from Org 1`);
      });
    });

    it('should NOT allow Org 1 to insert job with Org 2 companyId', async () => {
      await expect(async () => {
        await prisma.runWithOrgContext(org1Id, async (tx) => {
          // Try to create a job for Org 2 while in Org 1 context
          await tx.job.create({
            data: {
              title: 'Malicious Job',
              companyId: org2Id, // Wrong org!
              status: 'OPEN',
              experience: 'Junior',
            },
          });
        });
      }).rejects.toThrow();
      
      console.log(`    ✅ Verified: Creating job with wrong companyId threw error`);
    });
  });

  describe('🔄 Context Switching', () => {
    it('should properly isolate data when switching between org contexts', async () => {
      // Access as Org 1
      const org1Jobs = await prisma.runWithOrgContext(org1Id, async (tx) => {
        return tx.job.findMany();
      });

      // Switch to Org 2
      const org2Jobs = await prisma.runWithOrgContext(org2Id, async (tx) => {
        return tx.job.findMany();
      });

      // Verify complete isolation
      expect(org1Jobs.every(j => j.companyId === org1Id)).toBe(true);
      expect(org2Jobs.every(j => j.companyId === org2Id)).toBe(true);
      expect(org1Jobs.length).toBeGreaterThan(0);
      expect(org2Jobs.length).toBeGreaterThan(0);
      
      // Verify no overlap
      const org1Ids = org1Jobs.map(j => j.id);
      const org2Ids = org2Jobs.map(j => j.id);
      const overlap = org1Ids.filter(id => org2Ids.includes(id));
      expect(overlap.length).toBe(0);
      
      console.log(`    ✅ Verified: Org 1 has ${org1Jobs.length} jobs, Org 2 has ${org2Jobs.length} jobs, no overlap`);
    });

    it('should maintain isolation across multiple sequential context switches', async () => {
      const results: Array<{ orgId: number; jobCount: number; allCorrectOrg: boolean }> = [];

      for (let i = 0; i < 3; i++) {
        // Switch between orgs
        const org1Result = await prisma.runWithOrgContext(org1Id, async (tx) => {
          const jobs = await tx.job.findMany();
          return {
            orgId: org1Id,
            jobCount: jobs.length,
            allCorrectOrg: jobs.every(j => j.companyId === org1Id),
          };
        });
        results.push(org1Result);

        const org2Result = await prisma.runWithOrgContext(org2Id, async (tx) => {
          const jobs = await tx.job.findMany();
          return {
            orgId: org2Id,
            jobCount: jobs.length,
            allCorrectOrg: jobs.every(j => j.companyId === org2Id),
          };
        });
        results.push(org2Result);
      }

      // Verify all switches maintained isolation
      expect(results.every(r => r.allCorrectOrg)).toBe(true);
      console.log(`    ✅ Verified: ${results.length} context switches all maintained isolation`);
    });
  });

  describe('❌ No Context - Should Fail', () => {
    it('should return no results when no org context is set', async () => {
      // Try to query without setting org context
      // RLS policy: companyId = current_setting('app.current_org_id')
      // When not set, current_setting returns empty string, NULLIF converts to NULL
      // So companyId = NULL, which never matches
      const jobs = await prisma.job.findMany();
      
      // Should return empty array because RLS blocks everything
      expect(jobs.length).toBe(0);
      console.log(`    ✅ Verified: Query without org context returned 0 jobs`);
    });
  });

  describe('📊 RLS Metadata Verification', () => {
    it('should verify RLS is enabled on Job table', async () => {
      const result = await prisma.$queryRaw<Array<{ rowsecurity: boolean }>>`
        SELECT rowsecurity 
        FROM pg_tables 
        WHERE schemaname = 'public' AND tablename = 'Job'
      `;
      
      expect(result[0]?.rowsecurity).toBe(true);
      console.log(`    ✅ Verified: RLS is enabled on Job table`);
    });

    it('should verify RLS policies exist for Job table', async () => {
      const policies = await prisma.$queryRaw<Array<{ policyname: string; cmd: string }>>`
        SELECT policyname, cmd 
        FROM pg_policies 
        WHERE schemaname = 'public' AND tablename = 'Job'
        ORDER BY cmd
      `;
      
      expect(policies.length).toBeGreaterThanOrEqual(4); // SELECT, INSERT, UPDATE, DELETE
      
      const commands = policies.map(p => p.cmd);
      expect(commands).toContain('SELECT');
      expect(commands).toContain('INSERT');
      expect(commands).toContain('UPDATE');
      expect(commands).toContain('DELETE');
      
      console.log(`    ✅ Verified: ${policies.length} RLS policies exist for Job table`);
      policies.forEach(p => console.log(`       - ${p.policyname} (${p.cmd})`));
    });

    it('should verify FORCE ROW LEVEL SECURITY is enabled', async () => {
      const result = await prisma.$queryRaw<Array<{ relforcerowsecurity: boolean }>>`
        SELECT relforcerowsecurity 
        FROM pg_class 
        WHERE relname = 'Job' AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
      `;
      
      expect(result[0]?.relforcerowsecurity).toBe(true);
      console.log(`    ✅ Verified: FORCE ROW LEVEL SECURITY is enabled (owner doesn't bypass)`);
    });
  });
});
