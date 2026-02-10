import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isOrgWideScope, jobWhereForScope } from '../common/rbac/scope.util';
import { applicationListSelect } from './applications.select';

export type ApplicationScopeContext = {
  companyId: number;
  userId: number;
  roleKey: string;
};

@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ctx: ApplicationScopeContext, jobId?: number) {
    if (isOrgWideScope(ctx.roleKey)) {
      return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
        tx.application.findMany({
          where: {
            companyId: ctx.companyId,
            ...(jobId !== undefined ? { jobId } : {}),
          },
          select: applicationListSelect,
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
    if (ids.length === 0) {
      return [];
    }
    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findMany({
        where: {
          companyId: ctx.companyId,
          jobId: { in: ids },
          ...(jobId !== undefined ? { jobId } : {}),
        },
        select: applicationListSelect,
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  /**
   * Move application to a new pipeline stage. Enforces org isolation and recruiter scope.
   */
  async moveStage(
    ctx: ApplicationScopeContext,
    applicationId: number,
    stageId: number,
  ) {
    const app = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findFirst({
        where: { id: applicationId },
        select: {
          id: true,
          companyId: true,
          jobId: true,
          currentStageId: true,
        },
      }),
    );
    if (!app) throw new NotFoundException('Application not found');
    if (app.companyId !== ctx.companyId) {
      throw new ForbiddenException(
        'Access denied: resource does not belong to your organization',
      );
    }

    if (!isOrgWideScope(ctx.roleKey)) {
      const jobWhere = jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);
      const visibleJobIds = await this.prisma.job.findMany({
        where: jobWhere,
        select: { id: true },
      });
      const ids = visibleJobIds.map((j) => j.id);
      if (!ids.includes(app.jobId)) {
        throw new ForbiddenException(
          'Access denied: you do not have access to this application',
        );
      }
    }

    const stage = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.pipelineStage.findFirst({
        where: {
          id: stageId,
          OR: [{ jobId: app.jobId }, { companyId: ctx.companyId }],
        },
        select: { id: true },
      }),
    );
    if (!stage) throw new NotFoundException('Pipeline stage not found');

    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      // record stage change history
      await tx.applicationHistory.create({
        data: {
          applicationId,
          fromStageId: app.currentStageId ?? null,
          toStageId: stageId,
          changedById: ctx.userId,
          changedAt: new Date(),
        },
      });

      // ensure pipeline row exists for this stage (unique [applicationId, stageId])
      await tx.pipeline.upsert({
        where: { applicationId_stageId: { applicationId, stageId } },
        create: {
          applicationId,
          stageId,
          movedById: ctx.userId,
          movedAt: new Date(),
        },
        update: { movedById: ctx.userId, movedAt: new Date() },
      });

      return tx.application.update({
        where: { id: applicationId },
        data: { currentStageId: stageId },
        select: applicationListSelect,
      });
    });
  }
}
