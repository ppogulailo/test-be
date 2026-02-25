import {
  ForbiddenException,
  Injectable,
  Logger,
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
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Fire-and-forget: log recruiter activity and update JobStats counters.
   * Runs outside the main transaction so it never blocks the response.
   */
  private logActivity(
    recruiterId: number,
    companyId: number,
    jobId: number | null,
    activityType: string,
    statsIncrement?: Partial<{
      applicantCount: number;
      shortlistedCount: number;
      interviewedCount: number;
      offeredCount: number;
      hiredCount: number;
    }>,
  ): void {
    // Async, non-blocking — errors are logged but never thrown
    Promise.all([
      // Append a performance log entry
      this.prisma.recruiterPerformanceLog.create({
        data: {
          recruiterId,
          companyId,
          jobId: jobId ?? undefined,
          activityType,
          loggedAt: new Date(),
        },
      }),

      // Upsert JobStats counters if increment payload provided
      jobId && statsIncrement
        ? this.prisma.jobStats.upsert({
            where: { jobId },
            create: {
              jobId,
              companyId,
              applicantCount: statsIncrement.applicantCount ?? 0,
              shortlistedCount: statsIncrement.shortlistedCount ?? 0,
              interviewedCount: statsIncrement.interviewedCount ?? 0,
              offeredCount: statsIncrement.offeredCount ?? 0,
              hiredCount: statsIncrement.hiredCount ?? 0,
              lastCalculatedAt: new Date(),
            },
            update: {
              applicantCount: { increment: statsIncrement.applicantCount ?? 0 },
              shortlistedCount: {
                increment: statsIncrement.shortlistedCount ?? 0,
              },
              interviewedCount: {
                increment: statsIncrement.interviewedCount ?? 0,
              },
              offeredCount: { increment: statsIncrement.offeredCount ?? 0 },
              hiredCount: { increment: statsIncrement.hiredCount ?? 0 },
              lastCalculatedAt: new Date(),
            },
          })
        : Promise.resolve(),
    ]).catch((err) =>
      this.logger.warn(`logActivity failed (non-fatal): ${err?.message}`),
    );
  }

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
   * Schedule interview for an application
   */
  async scheduleInterview(
    ctx: ApplicationScopeContext,
    applicationId: number,
    dto: {
      userId: number;
      jobId: number;
      startAt: Date;
      endAt?: Date;
      mode?: any;
      location?: string;
      notes?: string;
    },
  ) {
    const app = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findFirst({
        where: { id: applicationId },
        select: { id: true, companyId: true, jobId: true },
      }),
    );

    if (!app) throw new NotFoundException('Application not found');
    if (app.companyId !== ctx.companyId) {
      throw new ForbiddenException('Access denied');
    }

    const interview = await this.prisma.runWithOrgContext(
      ctx.companyId,
      async (tx) => {
        const created = await tx.interview.create({
          data: {
            applicationId: applicationId,
            scheduledById: ctx.userId,
            scheduledAt: dto.startAt,
            type: dto.mode || 'VIDEO',
            status: 'SCHEDULED',
            description: dto.notes ?? null,
          },
        });

        // Update application status
        await tx.application.update({
          where: { id: applicationId },
          data: { status: 'INTERVIEW_SCHEDULED' },
        });

        return created;
      },
    );

    this.logActivity(ctx.userId, ctx.companyId, app.jobId, 'interview_scheduled', {
      interviewedCount: 1,
    });

    return { id: String(interview.id), status: 'SCHEDULED' };
  }

  /**
   * Shortlist an application
   */
  async shortlist(ctx: ApplicationScopeContext, applicationId: number) {
    const app = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findFirst({
        where: { id: applicationId },
        select: { id: true, companyId: true, jobId: true },
      }),
    );

    if (!app) throw new NotFoundException('Application not found');
    if (app.companyId !== ctx.companyId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.update({
        where: { id: applicationId },
        data: { status: 'SHORTLISTED' },
        select: { id: true, status: true },
      }),
    );

    this.logActivity(ctx.userId, ctx.companyId, app.jobId, 'candidate_shortlisted', {
      shortlistedCount: 1,
    });

    return { id: String(updated.id), status: updated.status };
  }

  /**
   * Extend offer to an application
   */
  async extendOffer(ctx: ApplicationScopeContext, applicationId: number) {
    const app = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findFirst({
        where: { id: applicationId },
        select: { id: true, companyId: true, jobId: true },
      }),
    );

    if (!app) throw new NotFoundException('Application not found');
    if (app.companyId !== ctx.companyId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.update({
        where: { id: applicationId },
        data: { status: 'OFFERED' },
        select: { id: true, status: true },
      }),
    );

    this.logActivity(ctx.userId, ctx.companyId, app.jobId, 'offer_sent', {
      offeredCount: 1,
    });

    return { id: String(updated.id), status: updated.status };
  }

  /**
   * Accept offer
   */
  async acceptOffer(ctx: ApplicationScopeContext, applicationId: number) {
    const app = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findFirst({
        where: { id: applicationId },
        select: { id: true, companyId: true, jobId: true },
      }),
    );

    if (!app) throw new NotFoundException('Application not found');
    if (app.companyId !== ctx.companyId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.update({
        where: { id: applicationId },
        data: { status: 'HIRED', offerAcceptedAt: new Date() },
        select: { id: true, status: true },
      }),
    );

    this.logActivity(ctx.userId, ctx.companyId, app.jobId, 'candidate_hired', {
      hiredCount: 1,
    });

    return { id: String(updated.id), status: updated.status };
  }

  /**
   * Decline offer
   */
  async declineOffer(ctx: ApplicationScopeContext, applicationId: number) {
    const app = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.findFirst({
        where: { id: applicationId },
        select: { id: true, companyId: true },
      }),
    );

    if (!app) throw new NotFoundException('Application not found');
    if (app.companyId !== ctx.companyId) {
      throw new ForbiddenException('Access denied');
    }

    const updated = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.application.update({
        where: { id: applicationId },
        data: { status: 'REJECTED' },
        select: { id: true, status: true },
      }),
    );

    return { id: String(updated.id), status: updated.status };
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

    const result = await this.prisma.runWithOrgContext(
      ctx.companyId,
      async (tx) => {
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
      },
    );

    this.logActivity(ctx.userId, ctx.companyId, app.jobId, 'pipeline_moved');

    return result;
  }
}
