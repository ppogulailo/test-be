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

  async list(ctx: CandidateScopeContext, jobId?: number) {
    if (isOrgWideScope(ctx.roleKey)) {
      return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
        tx.candidateProfile.findMany({
          where: {
            applications: {
              some: {
                companyId: ctx.companyId,
                ...(jobId !== undefined ? { jobId } : {}),
              },
            },
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
      // recruiter cannot list candidates for a job they don't own/aren't assigned
      return [];
    }

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.candidateProfile.findMany({
        where: {
          applications: {
            some: {
              companyId: ctx.companyId,
              jobId: jobId !== undefined ? jobId : { in: ids },
            },
          },
        },
        select: candidateListSelect,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  async getOne(candidateProfileId: number, ctx: CandidateScopeContext) {
    if (isOrgWideScope(ctx.roleKey)) {
      const candidate = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
        tx.candidateProfile.findFirst({
          where: {
            id: candidateProfileId,
            applications: { some: { companyId: ctx.companyId } },
          },
          select: candidateGetOneSelect,
        }),
      );
      if (!candidate) throw new NotFoundException('Candidate not found');
      return candidate;
    }

    const jobWhere = jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);
    const visibleJobIds = await this.prisma.job.findMany({
      where: jobWhere,
      select: { id: true },
    });
    const ids = visibleJobIds.map((j) => j.id);
    if (ids.length === 0) {
      throw new ForbiddenException('Access denied: no visible jobs');
    }

    const candidate = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.candidateProfile.findFirst({
        where: {
          id: candidateProfileId,
          applications: {
            some: { companyId: ctx.companyId, jobId: { in: ids } },
          },
        },
        select: candidateGetOneSelect,
      }),
    );
    if (!candidate) {
      throw new ForbiddenException(
        'Access denied: candidate is not tied to your jobs',
      );
    }
    return candidate;
  }
}

