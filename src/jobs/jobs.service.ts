import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOrgAccess } from '../common/rbac/org-access.util';
import { canAccessJob, isOrgWideScope, jobWhereForScope } from '../common/rbac/scope.util';
import type { CreateJobDto } from './dto/create-job.dto';

export type JobScopeContext = {
  companyId: number;
  userId: number;
  roleKey: string;
};

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List jobs. Admin/HM/Viewer/Reviewer: org-wide. Recruiter: own or assigned only.
   */
  async list(ctx: JobScopeContext) {
    const where = jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);
    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.findMany({
        where,
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }

  /**
   * Get one job by id. Recruiter: only if own or assigned; Admin/HM/Viewer/Reviewer: any job in org.
   */
  async getOne(jobId: number, ctx: JobScopeContext) {
    const job = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.findFirst({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          recruiterId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    assertOrgAccess(job.companyId, ctx.companyId);

    if (!isOrgWideScope(ctx.roleKey)) {
      const hasAssignment = await this.prisma.jobAssignment.findFirst({
        where: {
          jobId,
          recruiterId: ctx.userId,
          isActive: true,
        },
      });
      if (!canAccessJob(job, ctx.companyId, ctx.userId, ctx.roleKey, !!hasAssignment)) {
        throw new ForbiddenException('Access denied: you do not own or are not assigned to this job');
      }
    }
    const { recruiterId: _, ...rest } = job;
    return rest;
  }

  /**
   * Create a job in the current org. Recruiter becomes owner (recruiterId).
   */
  async create(ctx: JobScopeContext, dto: CreateJobDto) {
    const recruiterId = isOrgWideScope(ctx.roleKey) ? null : ctx.userId;
    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.create({
        data: {
          title: dto.title,
          experience: dto.experience,
          employmentType: dto.employmentType,
          workArrangement: dto.workArrangement,
          responsibilities: dto.responsibilities,
          requirements: dto.requirements,
          niceToHave: dto.niceToHave,
          perks: dto.perks,
          whoYouAre: dto.whoYouAre,
          education: dto.education ?? null,
          location: dto.location ?? null,
          tags: dto.tags,
          companyId: ctx.companyId,
          recruiterId,
          status: JobStatus.DRAFT,
        },
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          createdAt: true,
        },
      }),
    );
  }

  /**
   * Publish a job. Recruiter: only if own or assigned; Admin/HM: any job in org.
   */
  async publish(jobId: number, ctx: JobScopeContext) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId },
      select: { id: true, companyId: true, recruiterId: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    assertOrgAccess(job.companyId, ctx.companyId);

    if (!isOrgWideScope(ctx.roleKey)) {
      const hasAssignment = await this.prisma.jobAssignment.findFirst({
        where: {
          jobId,
          recruiterId: ctx.userId,
          isActive: true,
        },
      });
      if (!canAccessJob(job, ctx.companyId, ctx.userId, ctx.roleKey, !!hasAssignment)) {
        throw new ForbiddenException('Access denied: you do not own or are not assigned to this job');
      }
    }

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.update({
        where: { id: jobId },
        data: { status: JobStatus.LIVE },
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          updatedAt: true,
        },
      }),
    );
  }
}
