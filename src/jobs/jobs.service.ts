import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOrgAccess } from '../common/rbac/org-access.util';
import {
  canAccessJob,
  isOrgWideScope,
  jobWhereForScope,
} from '../common/rbac/scope.util';
import type { CreateJobDto } from './dto/create-job.dto';
import type { UpdateJobDto } from './dto/update-job.dto';
import type { SaveValuesDto } from './dto/save-values.dto';
import type { SaveBenchmarkDto } from './dto/save-benchmark.dto';
import {
  jobGetOneSelect,
  jobListSelect,
  jobPublishReadSelect,
} from './jobs.select';

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
        select: jobListSelect,
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
        select: jobGetOneSelect,
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
      if (
        !canAccessJob(
          job,
          ctx.companyId,
          ctx.userId,
          ctx.roleKey,
          !!hasAssignment,
        )
      ) {
        throw new ForbiddenException(
          'Access denied: you do not own or are not assigned to this job',
        );
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
        select: jobListSelect,
      }),
    );
  }

  /**
   * Publish a job. Recruiter: only if own or assigned; Admin/HM: any job in org.
   */
  async publish(jobId: number, ctx: JobScopeContext) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId },
      select: jobPublishReadSelect,
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
      if (
        !canAccessJob(
          job,
          ctx.companyId,
          ctx.userId,
          ctx.roleKey,
          !!hasAssignment,
        )
      ) {
        throw new ForbiddenException(
          'Access denied: you do not own or are not assigned to this job',
        );
      }
    }

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.update({
        where: { id: jobId },
        data: { status: JobStatus.LIVE },
        select: jobListSelect,
      }),
    );
  }

  /**
   * Update a job. Recruiter: only if own or assigned; Admin/HM: any job in org.
   */
  async update(jobId: number, ctx: JobScopeContext, dto: UpdateJobDto) {
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
      if (
        !canAccessJob(
          job,
          ctx.companyId,
          ctx.userId,
          ctx.roleKey,
          !!hasAssignment,
        )
      ) {
        throw new ForbiddenException(
          'Access denied: you do not own or are not assigned to this job',
        );
      }
    }

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.update({
        where: { id: jobId },
        data: dto,
        select: jobListSelect,
      }),
    );
  }

  /**
   * Delete a job. Recruiter: only if own; Admin/HM: any job in org.
   */
  async delete(jobId: number, ctx: JobScopeContext) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId },
      select: { id: true, companyId: true, recruiterId: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }
    assertOrgAccess(job.companyId, ctx.companyId);

    if (!isOrgWideScope(ctx.roleKey) && job.recruiterId !== ctx.userId) {
      throw new ForbiddenException(
        'Access denied: only the job owner can delete it',
      );
    }

    await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.delete({ where: { id: jobId } }),
    );

    return { deleted: true };
  }

  /**
   * Update job status. Recruiter: only if own or assigned; Admin/HM: any job in org.
   */
  async updateStatus(
    jobId: number,
    ctx: JobScopeContext,
    status: JobStatus,
  ) {
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
      if (
        !canAccessJob(
          job,
          ctx.companyId,
          ctx.userId,
          ctx.roleKey,
          !!hasAssignment,
        )
      ) {
        throw new ForbiddenException(
          'Access denied: you do not own or are not assigned to this job',
        );
      }
    }

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.update({
        where: { id: jobId },
        data: { status },
        select: jobListSelect,
      }),
    );
  }

  /**
   * Save job values. Recruiter: only if own or assigned; Admin/HM: any job in org.
   * TODO: Implement proper job values schema integration
   */
  async saveValues(
    jobId: number,
    ctx: JobScopeContext,
    dto: SaveValuesDto,
  ) {
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
      if (
        !canAccessJob(
          job,
          ctx.companyId,
          ctx.userId,
          ctx.roleKey,
          !!hasAssignment,
        )
      ) {
        throw new ForbiddenException(
          'Access denied: you do not own or are not assigned to this job',
        );
      }
    }

    // TODO: Implement using JobCoreValueKeyword model
    // The schema uses JobCoreValueKeyword which relates to CoreValue
    // This needs proper implementation matching the schema structure

    return { success: true };
  }

  /**
   * Save job benchmark. Recruiter: only if own or assigned; Admin/HM: any job in org.
   * TODO: Implement proper job benchmark schema integration
   */
  async saveBenchmark(
    jobId: number,
    ctx: JobScopeContext,
    dto: SaveBenchmarkDto,
  ) {
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
      if (
        !canAccessJob(
          job,
          ctx.companyId,
          ctx.userId,
          ctx.roleKey,
          !!hasAssignment,
        )
      ) {
        throw new ForbiddenException(
          'Access denied: you do not own or are not assigned to this job',
        );
      }
    }

    await this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      // TODO: Implement using JobBenchmarkProfile, JobBenchmarkCoreValue, JobBenchmarkTeamStyleTag
      // The schema structure is:
      // - JobBenchmarkProfile (main benchmark record)
      // - JobBenchmarkCoreValue (relates benchmark to core values)
      // - JobBenchmarkTeamStyleTag (relates benchmark to team style tags)
      // This needs proper implementation matching the actual schema structure
    });

    return { success: true };
  }
}
