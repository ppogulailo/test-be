import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isOrgWideScope, jobWhereForScope } from '../common/rbac/scope.util';
import { candidateGetOneSelect, candidateListSelect } from './candidates.select';

export type CandidateScopeContext = {
  companyId: number;
  userId: number;
  roleKey: string;
};

@Injectable()
export class CandidatesService {
  constructor(private readonly prisma: PrismaService) {}

  private visibilityWhere = {
    OR: [
      { profileVisibilityPreference: null },
      { profileVisibilityPreference: { showProfileToRecruiters: true } },
    ],
  };

  async list(ctx: CandidateScopeContext, jobId?: number) {
    if (isOrgWideScope(ctx.roleKey)) {
      return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
        tx.candidateProfile.findMany({
          where: {
            AND: [
              {
                applications: {
                  some: {
                    companyId: ctx.companyId,
                    ...(jobId !== undefined ? { jobId } : {}),
                  },
                },
              },
              this.visibilityWhere,
            ],
          },
          select: candidateListSelect,
          orderBy: { updatedAt: 'desc' },
        }),
      );
    }

    const jobWhere = jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);
    const visibleJobIds = await this.prisma.job.findMany({
      where: jobWhere,
      select: { id: true },
    });
    const ids = visibleJobIds.map((j) => j.id);
    if (ids.length === 0) return [];

    if (jobId !== undefined && !ids.includes(jobId)) {
      return [];
    }

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.candidateProfile.findMany({
        where: {
          AND: [
            {
              applications: {
                some: {
                  companyId: ctx.companyId,
                  jobId: jobId !== undefined ? jobId : { in: ids },
                },
              },
            },
            this.visibilityWhere,
          ],
        },
        select: candidateListSelect,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  async getOne(candidateProfileId: number, ctx: CandidateScopeContext) {
    const selectWithVisibility = {
      ...candidateGetOneSelect,
      profileVisibilityPreference: {
        select: { hideContactDetails: true },
      },
      contactInfo: { select: { email: true } },
      user: { select: { email: true } },
    };

    const findOne = async (where: object) =>
      this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
        tx.candidateProfile.findFirst({
          where: { AND: [where, this.visibilityWhere] },
          select: selectWithVisibility,
        }),
      );

    let candidate: Awaited<ReturnType<typeof findOne>>;
    if (isOrgWideScope(ctx.roleKey)) {
      candidate = await findOne({
        id: candidateProfileId,
        applications: { some: { companyId: ctx.companyId } },
      });
    } else {
      const jobWhere = jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);
      const visibleJobIds = await this.prisma.job.findMany({
        where: jobWhere,
        select: { id: true },
      });
      const ids = visibleJobIds.map((j) => j.id);
      if (ids.length === 0) throw new ForbiddenException('Access denied: no visible jobs');

      candidate = await findOne({
        id: candidateProfileId,
        applications: {
          some: { companyId: ctx.companyId, jobId: { in: ids } },
        },
      });
    }

    if (!candidate) throw new NotFoundException('Candidate not found');

    const c = candidate as typeof candidate & {
      profileVisibilityPreference?: { hideContactDetails?: boolean } | null;
      contactInfo?: { email?: string } | null;
      user?: { email?: string } | null;
    };
    const hideContact = c.profileVisibilityPreference?.hideContactDetails ?? false;
    const { profileVisibilityPreference, contactInfo, user, ...rest } = c;
    const email = contactInfo?.email ?? user?.email;
    return {
      ...rest,
      email: hideContact ? undefined : email,
      phone: hideContact ? undefined : rest.phone,
    };
  }
}

