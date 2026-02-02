import { ForbiddenException, Injectable } from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestUser } from '../../auth/auth.types';
import { accessRoleToKey } from '../utils/access-role.util';
import { AuthContext } from './auth-context.types';

@Injectable()
export class OrgContextService {
  constructor(private readonly prisma: PrismaService) {}

  async setCurrentOrg(userId: number, companyId: number) {
    await this.prisma.userCurrentOrg.upsert({
      where: { userId },
      create: { userId, companyId },
      update: { companyId },
    });
  }

  async resolveAuthContext(user: RequestUser): Promise<AuthContext> {
    const selected = await this.prisma.userCurrentOrg.findUnique({
      where: { userId: user.userId },
      select: { companyId: true },
    });

    if (selected?.companyId) {
      const ctx = await this.resolveAuthContextForOrg(user, selected.companyId);
      if (ctx) return ctx;
    }

    const defaultMembership =
      await this.prisma.organizationMembership.findFirst({
        where: { userId: user.userId, isActive: true },
        orderBy: { joinedAt: 'asc' },
        select: { id: true, companyId: true },
      });

    if (!defaultMembership) {
      throw new ForbiddenException(
        'User has no active organization membership',
      );
    }

    await this.setCurrentOrg(user.userId, defaultMembership.companyId);
    return this.resolveAuthContextForOrg(user, defaultMembership.companyId);
  }

  async resolveAuthContextForOrg(
    user: RequestUser,
    companyId: number,
  ): Promise<AuthContext> {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId: user.userId, companyId, isActive: true },
      select: { id: true, companyId: true },
    });

    if (!membership) {
      throw new ForbiddenException('User is not a member of this organization');
    }

    // Prefer org-level role (departmentId null), else first active role by assignedAt.
    const roleAssignments = await this.prisma.membershipRole.findMany({
      where: { membershipId: membership.id, isActive: true },
      orderBy: { assignedAt: 'desc' },
      select: { role: true, departmentId: true },
    });
    const orgLevel = roleAssignments.find((r) => r.departmentId === null);
    const role = (orgLevel ?? roleAssignments[0])?.role ?? AccessRole.RECRUITER;

    const mappings = await this.prisma.rolePermissionMapping.findMany({
      where: { role },
      select: { permission: { select: { name: true } } },
    });

    const permissions = mappings
      .map((m) => m.permission.name)
      .sort((a, b) => a.localeCompare(b));

    return {
      userId: String(user.userId),
      email: user.email,
      currentOrgId: String(membership.companyId),
      roleKey: accessRoleToKey(role),
      permissions,
    };
  }
}
