import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import {
  Prisma,
  PrismaClient,
  AccessRole,
  UserType,
} from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const SALT_ROUNDS = 10;

/** Demo user password (8+ chars to satisfy frontend validation). Use this in ACCEPTANCE_CRITERIA_DEMO.md */
const DEV_USER_PASSWORD = 'dev12345';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL environment variable is required but not set');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }),
});

type PermissionSeed = {
  name: string; // e.g. "job:create"
  description?: string;
};

const PERMISSIONS: PermissionSeed[] = [
  { name: 'job:create' },
  { name: 'job:read' },
  { name: 'job:update' },
  { name: 'job:delete' },
  { name: 'job:publish' },
  { name: 'job:approve' },
  { name: 'job:request_approval' },
  { name: 'job:archive' },
  { name: 'job:assign' },
  { name: 'candidate:read' },
  { name: 'candidate:search' },
  { name: 'candidate:compare' },
  { name: 'talent_pool:manage' },
  { name: 'reviewer:invite' },
  { name: 'messaging:send' },
  { name: 'pipeline:move_stage' },
  { name: 'analytics:view' },
  { name: 'analytics:dashboard' },
  { name: 'settings:team_manage' },
  { name: 'settings:billing_manage' },
  { name: 'settings:company_configure' },
];

const ROLE_PERMISSION_MATRIX: Record<AccessRole, string[]> = {
  [AccessRole.ORG_ADMIN]: PERMISSIONS.map((p) => p.name),
  [AccessRole.RECRUITER]: [
    'job:create',
    'job:read',
    'job:update',
    'job:publish',
    'job:request_approval',
    'job:archive',
    'candidate:read',
    'candidate:search',
    'candidate:compare',
    'talent_pool:manage',
    'reviewer:invite',
    'messaging:send',
    'pipeline:move_stage',
    'analytics:dashboard',
  ],
  [AccessRole.HM]: [
    'job:read',
    'job:approve',
    'job:archive',
    'job:assign',
    'candidate:read',
    'candidate:search',
    'candidate:compare',
    'reviewer:invite',
    'messaging:send',
    'pipeline:move_stage',
    'analytics:view',
    'analytics:dashboard',
    'settings:company_configure',
  ],
  [AccessRole.VIEWER]: ['job:read', 'candidate:read'],
  // Reviewer access is token-based; org-level permissions are not granted by default.
  [AccessRole.REVIEWER]: ['candidate:read', 'candidate:compare'],
};

function splitPermissionName(name: string): { domain: string; action: string } {
  const [domain, action] = name.split(':');
  return { domain: domain ?? name, action: action ?? '' };
}

async function getOrCreateCompany(tx: Prisma.TransactionClient, name: string) {
  const existing = await tx.company.findFirst({ where: { name } });
  if (existing) return existing;
  return tx.company.create({ data: { name } });
}

async function main() {
  // Lift FORCE ROW LEVEL SECURITY so FK checks on these tables work while
  // app.current_org_id is unset during seeding. Restored after the transaction.
  await prisma.$executeRawUnsafe('ALTER TABLE "Job" NO FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE "Application" NO FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE "PipelineStage" NO FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE report_templates NO FORCE ROW LEVEL SECURITY');

  await prisma.$transaction(async (tx) => {
    // 1) Canonical permissions (type inferred from upsert return)
    const permissions: Array<{
      id: number;
      name: string;
      domain: string;
      action: string;
      description: string | null;
    }> = [];
    for (const p of PERMISSIONS) {
      const { domain, action } = splitPermissionName(p.name);
      const created = await tx.accessPermission.upsert({
        where: { name: p.name },
        create: {
          name: p.name,
          domain,
          action,
          description: p.description ?? null,
        },
        update: {
          domain,
          action,
          description: p.description ?? null,
        },
      });
      permissions.push(created);
    }

    const permissionByName = new Map(permissions.map((p) => [p.name, p]));

    // 2) Role-permission mappings (global, enforced per org via membership role)
    for (const [role, permNames] of Object.entries(
      ROLE_PERMISSION_MATRIX,
    ) as Array<[AccessRole, string[]]>) {
      for (const permName of permNames) {
        const perm = permissionByName.get(permName);
        if (!perm) continue;

        const existing = await tx.rolePermissionMapping.findFirst({
          where: { role, permissionId: perm.id },
        });

        if (!existing) {
          await tx.rolePermissionMapping.create({
            data: {
              role,
              permissionId: perm.id,
            },
          });
        }
      }
    }

    // 3) Canonical Core Values (global, shared across all orgs)
    const CORE_VALUES = [
      { name: 'Mission and Vision Alignment',        category: 'Mission'     },
      { name: 'Growth and Development Opportunities', category: 'Growth'      },
      { name: 'Employee Experience and Satisfaction', category: 'Experience'  },
      { name: 'Predicting Job Performance',           category: 'Performance' },
      { name: 'Predicting Cultural Fit',              category: 'Culture'     },
      { name: 'Hard Skills',                          category: 'Performance' },
      // Benchmark step core value options
      { name: 'initiative',     category: 'Benchmark' },
      { name: 'accountability', category: 'Benchmark' },
      { name: 'ethical',        category: 'Benchmark' },
      { name: 'collaboration',  category: 'Benchmark' },
      { name: 'innovation',     category: 'Benchmark' },
      { name: 'leadership',     category: 'Benchmark' },
      { name: 'communication',  category: 'Benchmark' },
      { name: 'adaptability',   category: 'Benchmark' },
      { name: 'creativity',     category: 'Benchmark' },
      { name: 'problem-solving', category: 'Benchmark' },
    ];

    for (const cv of CORE_VALUES) {
      await tx.coreValue.upsert({
        where: { name: cv.name },
        create: { name: cv.name, category: cv.category, isActive: true },
        update: { category: cv.category, isActive: true },
      });
    }

    // 4) Organizations (Companies)
    const orgA = await getOrCreateCompany(tx, 'Org A');
    const orgB = await getOrCreateCompany(tx, 'Org B');

    // Test subscription companies
    let testCompanyBasic = await tx.company.findFirst({
      where: { name: 'Test Company Basic' },
    });
    if (!testCompanyBasic) {
      testCompanyBasic = await tx.company.create({
        data: {
          name: 'Test Company Basic',
          subscriptionTier: 'BASIC',
          subscriptionStatus: 'ACTIVE',
        },
      });
    } else {
      // Update existing to ensure correct tier
      testCompanyBasic = await tx.company.update({
        where: { id: testCompanyBasic.id },
        data: {
          subscriptionTier: 'BASIC',
          subscriptionStatus: 'ACTIVE',
        },
      });
    }

    let testCompanyPro = await tx.company.findFirst({
      where: { name: 'Test Company Pro' },
    });
    if (!testCompanyPro) {
      testCompanyPro = await tx.company.create({
        data: {
          name: 'Test Company Pro',
          subscriptionTier: 'PRO',
          subscriptionStatus: 'ACTIVE',
        },
      });
    } else {
      // Update existing to ensure correct tier
      testCompanyPro = await tx.company.update({
        where: { id: testCompanyPro.id },
        data: {
          subscriptionTier: 'PRO',
          subscriptionStatus: 'ACTIVE',
        },
      });
    }

    // 5) Dev user (password 8+ chars for frontend validation; signin with DEV_USER_PASSWORD)
    const devPasswordHash = await bcrypt.hash(DEV_USER_PASSWORD, SALT_ROUNDS);
    const devUser = await tx.user.upsert({
      where: { email: 'user1@example.com' },
      create: {
        email: 'user1@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
      },
    });

    // Additional demo users for Milestone 2 acceptance (Recruiter/HM in Org A; Viewer in Org B)
    const recruiterUser = await tx.user.upsert({
      where: { email: 'recruiter1@example.com' },
      create: {
        email: 'recruiter1@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
      },
      update: { password: devPasswordHash, isActive: true },
    });

    const hmUser = await tx.user.upsert({
      where: { email: 'hm1@example.com' },
      create: {
        email: 'hm1@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
      },
      update: { password: devPasswordHash, isActive: true },
    });

    const viewerUserB = await tx.user.upsert({
      where: { email: 'viewerb1@example.com' },
      create: {
        email: 'viewerb1@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
      },
      update: { password: devPasswordHash, isActive: true },
    });

    // Test subscription admins
    const adminBasic = await tx.user.upsert({
      where: { email: 'admin.basic@test.com' },
      create: {
        email: 'admin.basic@test.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: testCompanyBasic.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: testCompanyBasic.id,
      },
    });

    const adminPro = await tx.user.upsert({
      where: { email: 'admin.pro@test.com' },
      create: {
        email: 'admin.pro@test.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: testCompanyPro.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: testCompanyPro.id,
      },
    });

    // 6) Memberships
    const membershipA = await tx.organizationMembership.upsert({
      where: { userId_companyId: { userId: devUser.id, companyId: orgA.id } },
      create: {
        userId: devUser.id,
        companyId: orgA.id,
        isActive: true,
      },
      update: {
        isActive: true,
        leftAt: null,
      },
    });

    const membershipB = await tx.organizationMembership.upsert({
      where: { userId_companyId: { userId: devUser.id, companyId: orgB.id } },
      create: {
        userId: devUser.id,
        companyId: orgB.id,
        isActive: true,
      },
      update: {
        isActive: true,
        leftAt: null,
      },
    });

    const recruiterMembershipA = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: recruiterUser.id, companyId: orgA.id },
      },
      create: { userId: recruiterUser.id, companyId: orgA.id, isActive: true },
      update: { isActive: true, leftAt: null },
    });

    const hmMembershipA = await tx.organizationMembership.upsert({
      where: { userId_companyId: { userId: hmUser.id, companyId: orgA.id } },
      create: { userId: hmUser.id, companyId: orgA.id, isActive: true },
      update: { isActive: true, leftAt: null },
    });

    const viewerMembershipB = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: viewerUserB.id, companyId: orgB.id },
      },
      create: { userId: viewerUserB.id, companyId: orgB.id, isActive: true },
      update: { isActive: true, leftAt: null },
    });

    const adminBasicMembership = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: {
          userId: adminBasic.id,
          companyId: testCompanyBasic.id,
        },
      },
      create: {
        userId: adminBasic.id,
        companyId: testCompanyBasic.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    const adminProMembership = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: adminPro.id, companyId: testCompanyPro.id },
      },
      create: {
        userId: adminPro.id,
        companyId: testCompanyPro.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    // 7) Role assignments (org-level: departmentId null)
    for (const [membership, role] of [
      [membershipA, AccessRole.ORG_ADMIN],
      [membershipB, AccessRole.VIEWER],
    ] as const) {
      const existing = await tx.membershipRole.findFirst({
        where: { membershipId: membership.id, role, departmentId: null },
      });
      if (!existing) {
        await tx.membershipRole.create({
          data: {
            membershipId: membership.id,
            role,
            departmentId: null,
            isActive: true,
          },
        });
      }
    }

    for (const [membership, role] of [
      [recruiterMembershipA, AccessRole.RECRUITER],
      [hmMembershipA, AccessRole.HM],
      [viewerMembershipB, AccessRole.VIEWER],
      [adminBasicMembership, AccessRole.ORG_ADMIN],
      [adminProMembership, AccessRole.ORG_ADMIN],
    ] as const) {
      const existing = await tx.membershipRole.findFirst({
        where: { membershipId: membership.id, role, departmentId: null },
      });
      if (!existing) {
        await tx.membershipRole.create({
          data: {
            membershipId: membership.id,
            role,
            departmentId: null,
            isActive: true,
          },
        });
      }
    }

    // 8) Initial current org selection
    await tx.userCurrentOrg.upsert({
      where: { userId: devUser.id },
      create: {
        userId: devUser.id,
        companyId: orgA.id,
      },
      update: {
        companyId: orgA.id,
      },
    });

    await tx.userCurrentOrg.upsert({
      where: { userId: adminBasic.id },
      create: {
        userId: adminBasic.id,
        companyId: testCompanyBasic.id,
      },
      update: {
        companyId: testCompanyBasic.id,
      },
    });

    await tx.userCurrentOrg.upsert({
      where: { userId: adminPro.id },
      create: {
        userId: adminPro.id,
        companyId: testCompanyPro.id,
      },
      update: {
        companyId: testCompanyPro.id,
      },
    });

    // ========================================
    // RBAC TESTING: Org B Complete Team
    // ========================================

    // Admin for Org B
    const adminOrgB = await tx.user.upsert({
      where: { email: 'admin.orgb@example.com' },
      create: {
        email: 'admin.orgb@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
    });

    // Recruiter for Org B
    const recruiterOrgB = await tx.user.upsert({
      where: { email: 'recruiter.orgb@example.com' },
      create: {
        email: 'recruiter.orgb@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
    });

    // HM for Org B
    const hmOrgB = await tx.user.upsert({
      where: { email: 'hm.orgb@example.com' },
      create: {
        email: 'hm.orgb@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
    });

    // Create memberships for Org B team
    const adminMembershipB = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: adminOrgB.id, companyId: orgB.id },
      },
      create: {
        userId: adminOrgB.id,
        companyId: orgB.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    const recruiterMembershipB = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: recruiterOrgB.id, companyId: orgB.id },
      },
      create: {
        userId: recruiterOrgB.id,
        companyId: orgB.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    const hmMembershipB = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: hmOrgB.id, companyId: orgB.id },
      },
      create: {
        userId: hmOrgB.id,
        companyId: orgB.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    // Assign roles to Org B team
    for (const [membership, role] of [
      [adminMembershipB, AccessRole.ORG_ADMIN],
      [recruiterMembershipB, AccessRole.RECRUITER],
      [hmMembershipB, AccessRole.HM],
    ] as const) {
      const existing = await tx.membershipRole.findFirst({
        where: { membershipId: membership.id, role, departmentId: null },
      });
      if (!existing) {
        await tx.membershipRole.create({
          data: {
            membershipId: membership.id,
            role,
            departmentId: null,
            isActive: true,
          },
        });
      }
    }

    // Set current org for Org B users
    await tx.userCurrentOrg.upsert({
      where: { userId: adminOrgB.id },
      create: { userId: adminOrgB.id, companyId: orgB.id },
      update: { companyId: orgB.id },
    });

    await tx.userCurrentOrg.upsert({
      where: { userId: recruiterOrgB.id },
      create: { userId: recruiterOrgB.id, companyId: orgB.id },
      update: { companyId: orgB.id },
    });

    await tx.userCurrentOrg.upsert({
      where: { userId: hmOrgB.id },
      create: { userId: hmOrgB.id, companyId: orgB.id },
      update: { companyId: orgB.id },
    });

    await tx.userCurrentOrg.upsert({
      where: { userId: recruiterUser.id },
      create: { userId: recruiterUser.id, companyId: orgA.id },
      update: { companyId: orgA.id },
    });

    await tx.userCurrentOrg.upsert({
      where: { userId: hmUser.id },
      create: { userId: hmUser.id, companyId: orgA.id },
      update: { companyId: orgA.id },
    });

    // ========================================
    // RBAC TESTING: Add Recruiter 2 to Both Orgs
    // ========================================

    // Recruiter 2 for Org A
    const recruiter2OrgA = await tx.user.upsert({
      where: { email: 'recruiter2.orga@example.com' },
      create: {
        email: 'recruiter2.orga@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: orgA.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: orgA.id,
      },
    });

    const recruiter2MembershipA = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: recruiter2OrgA.id, companyId: orgA.id },
      },
      create: {
        userId: recruiter2OrgA.id,
        companyId: orgA.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    const existingRec2RoleA = await tx.membershipRole.findFirst({
      where: { membershipId: recruiter2MembershipA.id, role: AccessRole.RECRUITER, departmentId: null },
    });
    if (!existingRec2RoleA) {
      await tx.membershipRole.create({
        data: {
          membershipId: recruiter2MembershipA.id,
          role: AccessRole.RECRUITER,
          departmentId: null,
          isActive: true,
        },
      });
    }

    await tx.userCurrentOrg.upsert({
      where: { userId: recruiter2OrgA.id },
      create: { userId: recruiter2OrgA.id, companyId: orgA.id },
      update: { companyId: orgA.id },
    });

    // Recruiter 2 for Org B
    const recruiter2OrgB = await tx.user.upsert({
      where: { email: 'recruiter2.orgb@example.com' },
      create: {
        email: 'recruiter2.orgb@example.com',
        password: devPasswordHash,
        type: UserType.TEAM_MEMBER,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
        companyId: orgB.id,
      },
    });

    const recruiter2MembershipB = await tx.organizationMembership.upsert({
      where: {
        userId_companyId: { userId: recruiter2OrgB.id, companyId: orgB.id },
      },
      create: {
        userId: recruiter2OrgB.id,
        companyId: orgB.id,
        isActive: true,
      },
      update: { isActive: true, leftAt: null },
    });

    const existingRec2RoleB = await tx.membershipRole.findFirst({
      where: { membershipId: recruiter2MembershipB.id, role: AccessRole.RECRUITER, departmentId: null },
    });
    if (!existingRec2RoleB) {
      await tx.membershipRole.create({
        data: {
          membershipId: recruiter2MembershipB.id,
          role: AccessRole.RECRUITER,
          departmentId: null,
          isActive: true,
        },
      });
    }

    await tx.userCurrentOrg.upsert({
      where: { userId: recruiter2OrgB.id },
      create: { userId: recruiter2OrgB.id, companyId: orgB.id },
      update: { companyId: orgB.id },
    });

    // ========================================
    // RBAC TESTING: Test Jobs
    // ========================================

    // Temporarily disable RLS for seeding
    await tx.$executeRawUnsafe('SET row_security = off');

    // Job in Org A (assigned to recruiter1)
    const jobOrgA = await tx.job.upsert({
      where: { id: 1 },
      create: {
        id: 1,
        title: 'Senior Software Engineer - Org A',
        experience: 'SENIOR',
        employmentType: 'LONG_TERM',
        workArrangement: 'REMOTE',
        responsibilities: 'Lead development\\nCode review\\nMentoring',
        requirements: 'ADVANCED',
        niceToHave: ['TypeScript', 'GraphQL'],
        perks: 'Health insurance\\nRemote work',
        whoYouAre: ['Team player', 'Self-motivated'],
        education: "Bachelor's in Computer Science",
        location: 'Remote - USA',
        tags: ['engineering', 'senior'],
        minSalary: 120000,
        maxSalary: 180000,
        status: 'LIVE',
        companyId: orgA.id,
        recruiterId: recruiterUser.id,
      },
      update: {
        title: 'Senior Software Engineer - Org A',
        status: 'LIVE',
        companyId: orgA.id,
        recruiterId: recruiterUser.id,
      },
    });

    // Job 2 in Org A (assigned to recruiter2) - To show scope differences
    const job2OrgA = await tx.job.upsert({
      where: { id: 2 },
      create: {
        id: 2,
        title: 'Frontend Developer - Org A',
        experience: 'MID',
        employmentType: 'LONG_TERM',
        workArrangement: 'REMOTE',
        responsibilities: 'Build UI components\\nImplement designs\\nOptimize performance',
        requirements: 'INTERMEDIATE',
        niceToHave: ['Next.js', 'Design system experience'],
        perks: 'Remote work\\nLearning budget',
        whoYouAre: ['Detail-oriented', 'UX-focused'],
        education: "Bachelor's in Computer Science or equivalent",
        location: 'Remote - USA',
        tags: ['frontend', 'react'],
        minSalary: 90000,
        maxSalary: 140000,
        status: 'LIVE',
        companyId: orgA.id,
        recruiterId: recruiter2OrgA.id,
      },
      update: {
        title: 'Frontend Developer - Org A',
        status: 'LIVE',
        companyId: orgA.id,
        recruiterId: recruiter2OrgA.id,
      },
    });

    // Job 3 in Org B
    const jobOrgB = await tx.job.upsert({
      where: { id: 3 },
      create: {
        id: 3,
        title: 'Product Manager - Org B',
        experience: 'MID',
        employmentType: 'LONG_TERM',
        workArrangement: 'HYBRID',
        responsibilities: 'Product strategy\\nRoadmap planning\\nStakeholder management',
        requirements: 'INTERMEDIATE',
        niceToHave: ['Technical background', 'B2B SaaS'],
        perks: 'Equity\\nFlexible hours',
        whoYouAre: ['Data-driven', 'Customer-focused'],
        education: "Bachelor's degree",
        location: 'New York, USA',
        tags: ['product', 'management'],
        minSalary: 100000,
        maxSalary: 150000,
        status: 'LIVE',
        companyId: orgB.id,
        recruiterId: recruiterOrgB.id,
      },
      update: {
        title: 'Product Manager - Org B',
        status: 'LIVE',
        companyId: orgB.id,
        recruiterId: recruiterOrgB.id,
      },
    });

    // Reset Job id sequence so next create() doesn't reuse 1 (seed uses explicit id: 1,2,3)
    await tx.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"Job"', 'id'), (SELECT COALESCE(MAX(id), 1) FROM "Job"))`,
    );

    // Job Assignment: Job 1 → Recruiter1 (Org A)
    const existingAssignment1 = await tx.jobAssignment.findFirst({
      where: { jobId: jobOrgA.id, recruiterId: recruiterUser.id },
    });

    if (!existingAssignment1) {
      await tx.jobAssignment.create({
        data: {
          jobId: jobOrgA.id,
          recruiterId: recruiterUser.id,
          companyId: orgA.id,
          assignedById: devUser.id, // Admin assigned it
          isActive: true,
        },
      });
    }

    // Job Assignment: Job 2 → Recruiter2 (Org A)
    const existingAssignment2 = await tx.jobAssignment.findFirst({
      where: { jobId: job2OrgA.id, recruiterId: recruiter2OrgA.id },
    });

    if (!existingAssignment2) {
      await tx.jobAssignment.create({
        data: {
          jobId: job2OrgA.id,
          recruiterId: recruiter2OrgA.id,
          companyId: orgA.id,
          assignedById: devUser.id, // Admin assigned it
          isActive: true,
        },
      });
    }

    // ========================================
    // RBAC TESTING: Candidate & Application
    // ========================================

    // Create candidate user
    const candidateUser = await tx.user.upsert({
      where: { email: 'candidate1@example.com' },
      create: {
        email: 'candidate1@example.com',
        password: devPasswordHash,
        type: UserType.CANDIDATE,
        isActive: true,
        emailVerified: true,
      },
      update: {
        password: devPasswordHash,
        isActive: true,
        emailVerified: true,
      },
    });

    // Create candidate profile
    const candidateProfile = await tx.candidateProfile.upsert({
      where: { userId: candidateUser.id },
      create: {
        userId: candidateUser.id,
        firstName: 'John',
        lastName: 'Candidate',
        phone: '+1234567890',
        country: 'USA',
        state: 'CA',
        jobTitle: 'Software Engineer',
        aboutMe: 'Experienced software engineer looking for new opportunities',
      },
      update: {
        firstName: 'John',
        lastName: 'Candidate',
      },
    });

    // Create application in Org A
    const existingApplication = await tx.application.findFirst({
      where: { 
        candidateProfileId: candidateProfile.id,
        jobId: jobOrgA.id,
      },
    });

    if (!existingApplication) {
      await tx.application.create({
        data: {
          candidateProfileId: candidateProfile.id,
          jobId: jobOrgA.id,
          companyId: orgA.id,
          status: 'SUBMITTED',
          text: 'I am very interested in this position and believe my experience aligns well with your requirements.',
        },
      });
    }

    // ========================================
    // DASHBOARD DEMO DATA
    // ========================================

    // --- Extra candidates ---
    const candidateUsers = await Promise.all(
      [
        { email: 'alice@demo.com', first: 'Alice', last: 'Martin', title: 'Product Designer' },
        { email: 'bob@demo.com', first: 'Bob', last: 'Chen', title: 'Backend Engineer' },
        { email: 'carol@demo.com', first: 'Carol', last: 'Davis', title: 'Full-stack Developer' },
        { email: 'dave@demo.com', first: 'Dave', last: 'Wilson', title: 'React Developer' },
        { email: 'eve@demo.com', first: 'Eve', last: 'Smith', title: 'Senior Engineer' },
      ].map(async (c) => {
        const u = await tx.user.upsert({
          where: { email: c.email },
          create: { email: c.email, password: devPasswordHash, type: UserType.CANDIDATE, isActive: true },
          update: { password: devPasswordHash },
        });
        const p = await tx.candidateProfile.upsert({
          where: { userId: u.id },
          create: { userId: u.id, firstName: c.first, lastName: c.last, jobTitle: c.title },
          update: { firstName: c.first, lastName: c.last },
        });
        return { user: u, profile: p };
      }),
    );

    // PipelineStage has a unique constraint on (companyId, name).
    // Stages are shared per-company; we look up or create by (companyId, name).
    const stageNames = ['Applied', 'Screening', 'Interview', 'Offer', 'Hired'] as const;
    const stageTypes = ['INITIAL', 'SHORTLIST', 'INTERVIEW', 'OFFER', 'CUSTOM'] as const;
    const stages: { id: number; type: string }[] = [];

    for (let i = 0; i < stageNames.length; i++) {
      const existing = await tx.pipelineStage.findFirst({
        where: { companyId: orgA.id, name: stageNames[i] },
      });
      const stage = existing ?? await tx.pipelineStage.create({
        data: {
          name: stageNames[i],
          type: stageTypes[i],
          position: i + 1,
          isInitialStage: i === 0,
          jobId: jobOrgA.id,
          companyId: orgA.id,
        },
      });
      stages.push({ id: stage.id, type: stageTypes[i] });
    }

    const [appliedStage, , interviewStage] = stages;

    // Job 2 reuses the same shared stages (same org, same stage names)
    const stages2 = stages;

    // --- Applications with varying statuses ---
    type AppStatus = 'SUBMITTED' | 'SHORTLISTED' | 'INTERVIEW_SCHEDULED' | 'OFFERED' | 'HIRED' | 'REJECTED';
    const appSeeds: { profileId: number; jobId: number; companyId: number; status: AppStatus; stageIdx: number }[] = [
      { profileId: candidateUsers[0].profile.id, jobId: jobOrgA.id, companyId: orgA.id, status: 'SHORTLISTED', stageIdx: 1 },
      { profileId: candidateUsers[1].profile.id, jobId: jobOrgA.id, companyId: orgA.id, status: 'INTERVIEW_SCHEDULED', stageIdx: 2 },
      { profileId: candidateUsers[2].profile.id, jobId: jobOrgA.id, companyId: orgA.id, status: 'OFFERED', stageIdx: 3 },
      { profileId: candidateUsers[3].profile.id, jobId: job2OrgA.id, companyId: orgA.id, status: 'SUBMITTED', stageIdx: 0 },
      { profileId: candidateUsers[4].profile.id, jobId: job2OrgA.id, companyId: orgA.id, status: 'SHORTLISTED', stageIdx: 1 },
      // candidate1 already has SUBMITTED on job1 — skip duplicate
    ];

    const createdApps: { id: number; jobId: number; companyId: number; currentStageId: number | null }[] = [];

    for (const seed of appSeeds) {
      const existing = await tx.application.findFirst({
        where: { candidateProfileId: seed.profileId, jobId: seed.jobId },
      });
      const stageId = seed.jobId === jobOrgA.id
        ? stages[seed.stageIdx].id
        : stages2[seed.stageIdx].id;

      const app = existing
        ? await tx.application.update({
            where: { id: existing.id },
            data: { status: seed.status, currentStageId: stageId },
            select: { id: true, jobId: true, companyId: true, currentStageId: true },
          })
        : await tx.application.create({
            data: {
              candidateProfileId: seed.profileId,
              jobId: seed.jobId,
              companyId: seed.companyId,
              status: seed.status,
              currentStageId: stageId,
            },
            select: { id: true, jobId: true, companyId: true, currentStageId: true },
          });

      createdApps.push(app);

      // Pipeline row
      await tx.pipeline.upsert({
        where: { applicationId_stageId: { applicationId: app.id, stageId } },
        create: { applicationId: app.id, stageId, movedById: recruiterUser.id, movedAt: new Date() },
        update: { movedAt: new Date() },
      });

      // History: Applied → current stage (two rows for any stage > 0)
      const historyCount = await tx.applicationHistory.count({ where: { applicationId: app.id } });
      if (historyCount === 0) {
        await tx.applicationHistory.create({
          data: {
            applicationId: app.id,
            fromStageId: null,
            toStageId: appliedStage.id,
            changedById: recruiterUser.id,
            changedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          },
        });
        if (seed.stageIdx > 0) {
          await tx.applicationHistory.create({
            data: {
              applicationId: app.id,
              fromStageId: appliedStage.id,
              toStageId: stageId,
              changedById: recruiterUser.id,
              changedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            },
          });
        }
      }
    }

    // --- Upcoming interview (2 days from now) ---
    const interviewApp = createdApps.find((a) => a.jobId === jobOrgA.id && a.currentStageId === interviewStage.id);
    if (interviewApp) {
      const existingInterview = await tx.interview.findFirst({
        where: { applicationId: interviewApp.id },
      });
      if (!existingInterview) {
        await tx.interview.create({
          data: {
            applicationId: interviewApp.id,
            scheduledById: recruiterUser.id,
            scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            type: 'VIDEO',
            status: 'SCHEDULED',
            description: 'Technical interview – system design round',
          },
        });
      }
    }

    // --- JobStats for Job 1 ---
    await tx.jobStats.upsert({
      where: { jobId: jobOrgA.id },
      create: {
        jobId: jobOrgA.id,
        companyId: orgA.id,
        applicantCount: 4,
        shortlistedCount: 2,
        interviewedCount: 1,
        offeredCount: 1,
        hiredCount: 0,
        lastCalculatedAt: new Date(),
      },
      update: {
        applicantCount: 4,
        shortlistedCount: 2,
        interviewedCount: 1,
        offeredCount: 1,
        hiredCount: 0,
        lastCalculatedAt: new Date(),
      },
    });

    // --- JobStats for Job 2 ---
    await tx.jobStats.upsert({
      where: { jobId: job2OrgA.id },
      create: {
        jobId: job2OrgA.id,
        companyId: orgA.id,
        applicantCount: 2,
        shortlistedCount: 1,
        interviewedCount: 0,
        offeredCount: 0,
        hiredCount: 0,
        lastCalculatedAt: new Date(),
      },
      update: {
        applicantCount: 2,
        shortlistedCount: 1,
        interviewedCount: 0,
        offeredCount: 0,
        hiredCount: 0,
        lastCalculatedAt: new Date(),
      },
    });

    // --- RecruiterPerformanceLog entries (last 30 days) ---
    const perfActivities = [
      { type: 'pipeline_moved', daysAgo: 1 },
      { type: 'pipeline_moved', daysAgo: 2 },
      { type: 'pipeline_moved', daysAgo: 3 },
      { type: 'interview_scheduled', daysAgo: 2 },
      { type: 'candidate_shortlisted', daysAgo: 4 },
      { type: 'candidate_shortlisted', daysAgo: 5 },
      { type: 'offer_sent', daysAgo: 1 },
    ];

    for (const activity of perfActivities) {
      await tx.recruiterPerformanceLog.create({
        data: {
          recruiterId: recruiterUser.id,
          companyId: orgA.id,
          jobId: jobOrgA.id,
          activityType: activity.type,
          loggedAt: new Date(Date.now() - activity.daysAgo * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Keep Job autoincrement ahead after explicit IDs (1,2,3) used above.
    // Sequence-only bump is safe even when FORCE RLS blocks table-wide MAX(id).
    await tx.$executeRawUnsafe(
      `SELECT setval('"Job_id_seq"', last_value + 1000, true) FROM "Job_id_seq"`,
    );

    // Re-enable RLS after seeding
    await tx.$executeRawUnsafe('SET row_security = on');

    console.log('✅ Seed completed successfully!');
    console.log('');
    console.log('🎭 Test Accounts Created:');
    console.log('');
    console.log('Org A (Test Company A):');
    console.log('  Admin:       user1@example.com / dev12345');
    console.log('  Recruiter 1: recruiter1@example.com / dev12345');
    console.log('  Recruiter 2: recruiter2.orga@example.com / dev12345');
    console.log('  HM:          hm1@example.com / dev12345');
    console.log('  HM Demo:     hm.demo@example.com / dev12345');
    console.log('');
    console.log('Org B (Test Company B):');
    console.log('  Admin:       admin.orgb@example.com / dev12345');
    console.log('  Recruiter 1: recruiter.orgb@example.com / dev12345');
    console.log('  Recruiter 2: recruiter2.orgb@example.com / dev12345');
    console.log('  HM:          hm.orgb@example.com / dev12345');
    console.log('  Viewer:      viewerb1@example.com / dev12345');
    console.log('');
    console.log('Subscription Tests:');
    console.log('  BASIC:       admin.basic@test.com / dev12345');
    console.log('  PRO:         admin.pro@test.com / dev12345');
    console.log('');
    console.log('Candidate:');
    console.log('  candidate1@example.com / dev12345');
    console.log('');
    console.log('📊 Test Data:');
    console.log('  Org A Jobs (2 total):');
    console.log('    - Job 1: "Senior Software Engineer - Org A" (assigned to recruiter1@example.com)');
    console.log('    - Job 2: "Frontend Developer - Org A" (assigned to recruiter2.orga@example.com)');
    console.log('');
    console.log('  Org B Jobs (1 total):');
    console.log('    - Job 3: "Product Manager - Org B" (assigned to recruiter.orgb@example.com)');
    console.log('');
    console.log('  Applications:');
    console.log('    - Application: candidate1@example.com → Job 1 (Org A)');
    console.log('');
    console.log('🎯 RBAC Testing:');
    console.log('  • Recruiter1 (Org A): Can ONLY see/edit Job 1 (assigned to them)');
    console.log('  • Recruiter2 (Org A): Can ONLY see/edit Job 2 (assigned to them)');
    console.log('  • HM (Org A): Can see BOTH Job 1 & Job 2 (org-wide access)');
    console.log('  • Users from Org B: Cannot see any Org A jobs (cross-org isolation)');
    console.log('');

    // ── Report Templates (Org A) ───────────────────────────────────────────
    const reportTemplates = [
      {
        title: 'Applications Export',
        description: 'All applications with stage, status and interview counts',
        tag: 'Live',
        exportType: 'applications',
        format: 'csv',
        generatedAt: new Date(Date.now() - 2 * 60 * 1000),
      },
      {
        title: 'Pipeline History Export',
        description: 'Full stage-transition audit trail for every candidate',
        tag: 'Live',
        exportType: 'pipeline',
        format: 'csv',
        generatedAt: new Date(Date.now() - 5 * 60 * 1000),
      },
      {
        title: 'Full Analytics (JSON)',
        description: 'Funnel rates, time-in-stage and conversion metrics',
        tag: 'Live',
        exportType: 'applications',
        format: 'json',
        generatedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ];

    for (const tpl of reportTemplates) {
      const existing = await tx.reportTemplate.findFirst({
        where: { companyId: orgA.id, title: tpl.title },
      });
      if (!existing) {
        await tx.reportTemplate.create({
          data: { ...tpl, companyId: orgA.id },
        });
      }
    }
    console.log('✅ Report templates seeded for Org A');
  });

  // Restore FORCE ROW LEVEL SECURITY after the transaction completes
  await prisma.$executeRawUnsafe('ALTER TABLE "PipelineStage" FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE "Application" FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE "Job" FORCE ROW LEVEL SECURITY');
  await prisma.$executeRawUnsafe('ALTER TABLE report_templates FORCE ROW LEVEL SECURITY');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
