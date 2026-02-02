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
];

const ROLE_PERMISSION_MATRIX: Record<AccessRole, string[]> = {
  [AccessRole.ORG_ADMIN]: PERMISSIONS.map((p) => p.name),
  [AccessRole.RECRUITER]: [
    'job:create',
    'job:read',
    'job:update',
    'job:publish',
  ],
  [AccessRole.VIEWER]: ['job:read'],
  // Existing roles (not used in Milestone 1 seed)
  [AccessRole.HM]: [],
  [AccessRole.REVIEWER]: [],
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

    // 3) Organizations (Companies)
    const orgA = await getOrCreateCompany(tx, 'Org A');
    const orgB = await getOrCreateCompany(tx, 'Org B');

    // 4) Dev user (password 8+ chars for frontend validation; signin with DEV_USER_PASSWORD)
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

    // 5) Memberships
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

    // 6) Role assignments (org-level: departmentId null)
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

    // 7) Initial current org selection
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
  });
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
