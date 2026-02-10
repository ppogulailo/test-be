import { Injectable, NotFoundException } from '@nestjs/common';
import { AccessRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OrgContextService } from '../common/context/org-context.service';
import { accessRoleToKey } from '../common/utils/access-role.util';

@Injectable()
export class OrganizationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgContext: OrgContextService,
  ) {}

  async listForUser(userId: number, currentOrgId: number) {
    const memberships = await this.prisma.organizationMembership.findMany({
      where: { userId, isActive: true },
      orderBy: { joinedAt: 'asc' },
      select: {
        company: { select: { id: true, name: true } },
        roleAssignments: {
          where: { isActive: true, departmentId: null },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: { role: true },
        },
      },
    });

    return memberships.map((m) => {
      const role = m.roleAssignments[0]?.role ?? AccessRole.RECRUITER;
      return {
        orgId: String(m.company.id),
        name: m.company.name,
        isCurrent: m.company.id === currentOrgId,
        roleKey: accessRoleToKey(role),
      };
    });
  }

  async switchOrg(userId: number, email: string, orgId: number) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, companyId: orgId, isActive: true },
      select: { id: true },
    });

    if (!membership) {
      throw new NotFoundException('Organization not found for user');
    }

    await this.orgContext.setCurrentOrg(userId, orgId);
    return this.orgContext.resolveAuthContextForOrg({ userId, email }, orgId);
  }

  async getCurrentMemberPermissions(userId: number, orgId: number) {
    const membership = await this.prisma.organizationMembership.findFirst({
      where: { userId, companyId: orgId, isActive: true },
      select: {
        id: true,
        roleAssignments: {
          where: { isActive: true, departmentId: null },
          orderBy: { assignedAt: 'desc' },
          take: 1,
          select: { role: true },
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Member not found in organization');
    }

    const role = membership.roleAssignments[0]?.role ?? AccessRole.RECRUITER;

    // Get permission overrides for this user
    const userPermissions = await this.prisma.userPermission.findMany({
      where: { userId, isActive: true },
      select: { permission: { select: { name: true } } },
    });

    const overrides: Record<string, boolean> = {};
    userPermissions.forEach((up) => {
      overrides[up.permission.name] = true;
    });

    return {
      userId: String(userId),
      member: {
        id: String(membership.id),
        role: accessRoleToKey(role),
        customRole: null,
      },
      overrides,
    };
  }
}
