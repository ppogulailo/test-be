import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  JobStatus,
  Prisma,
  JobLanguage,
  RequirementsLevel,
  HiringFocus,
  DevelopmentStrategy,
  LongTermAlignment,
} from '@prisma/client';
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
    const jobs = await this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.findMany({
        where,
        select: jobListSelect,
        orderBy: { updatedAt: 'desc' },
      }),
    );

    return jobs.map(({ recruiter, ...rest }) => {
      const recruiterName = recruiter?.profile
        ? [recruiter.profile.firstName, recruiter.profile.lastName]
            .filter(Boolean)
            .join(' ') || null
        : null;
      return {
        ...rest,
        assignedRecruiter: recruiter
          ? { id: String(recruiter.id), user: { name: recruiterName } }
          : null,
      };
    });
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

    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      recruiterId: _,
      recruiter,
      JobCoreValueKeyword,
      JobCoreValueWeighting,
      JobBenchmarkProfile,
      ...rest
    } = job;

    // Build values: group keywords by dimension, merge with weights
    const weightByDimension = new Map<string, number>();
    for (const w of JobCoreValueWeighting) {
      weightByDimension.set(w.coreValue.name, w.weight);
    }
    const keywordsByDimension = new Map<string, string[]>();
    for (const kw of JobCoreValueKeyword) {
      const dim = kw.coreValue.name;
      if (!keywordsByDimension.has(dim)) keywordsByDimension.set(dim, []);
      keywordsByDimension.get(dim)!.push(kw.keyword);
    }
    const allDimensions = new Set([
      ...keywordsByDimension.keys(),
      ...weightByDimension.keys(),
    ]);
    const values = Array.from(allDimensions).map((dimension) => {
      const keywords = keywordsByDimension.get(dimension) ?? [];
      return {
        dimension,
        keyword1: keywords[0] ?? null,
        keyword2: keywords[1] ?? null,
        keyword3: keywords[2] ?? null,
        weight: weightByDimension.get(dimension) ?? null,
      };
    });

    // Build benchmark from the first profile (at most one per job)
    const benchmarkProfile = JobBenchmarkProfile[0] ?? null;
    const benchmark = benchmarkProfile
      ? {
          jobPostRole: benchmarkProfile.jobPostRole,
          benchmarkRole: benchmarkProfile.benchmarkRole ?? null,
          hiringFocus: benchmarkProfile.fitPriority?.hiringFocus ?? null,
          developmentStrategy:
            benchmarkProfile.fitPriority?.devStrategy ?? null,
          longTermAlignment: benchmarkProfile.fitPriority?.longTerm ?? null,
          candidateFitPriority: null,
          coreValues: benchmarkProfile.coreValues.map((cv) => ({
            value: cv.coreValue.name,
            weight: cv.weight,
          })),
          teamStyleTags: benchmarkProfile.teamStyleTags.map((t) => ({
            tag: t.tag,
          })),
        }
      : null;

    const recruiterName = recruiter?.profile
      ? [recruiter.profile.firstName, recruiter.profile.lastName]
          .filter(Boolean)
          .join(' ') || null
      : null;

    return {
      ...rest,
      assignedRecruiter: recruiter
        ? { user: { name: recruiterName } }
        : null,
      values,
      benchmark,
    };
  }

  /**
   * Create a job in the current org. Recruiter becomes owner (recruiterId).
   */
  async create(ctx: JobScopeContext, dto: CreateJobDto) {
    const recruiterId =
      dto.assignedRecruiterId ??
      dto.recruiterId ??
      (isOrgWideScope(ctx.roleKey) ? null : ctx.userId);

    const prismaLanguage = dto.language
      ? (dto.language.toUpperCase() as JobLanguage)
      : undefined;

    const prismaRequirements = dto.requirements
      ? (dto.requirements.toUpperCase() as RequirementsLevel)
      : undefined;

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.create({
        data: {
          title: dto.title,
          experience: dto.experience,
          employmentType: dto.employmentType,
          workArrangement: dto.workArrangement,
          responsibilities: dto.responsibilities ?? null,
          requirements: prismaRequirements ?? null,
          perks: dto.perks ?? null,
          education: dto.education ?? null,
          location: dto.location ?? null,

          language: prismaLanguage ?? null,
          introduction: dto.introduction ?? null,
          salary: dto.salary ?? null,
          hoursPerWeek: dto.hoursPerWeek ?? null,
          companySize: dto.companySize ?? null,
          videoUrl: dto.videoUrl ?? null,
          applicationClosingDate: dto.applicationClosingDate
            ? new Date(dto.applicationClosingDate)
            : null,
          jobNumber: dto.jobNumber ?? null,

          companyId: ctx.companyId,
          recruiterId,
          departmentId: dto.departmentId ?? null,
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

    const {
      applicationClosingDate,
      recruiterId,
      assignedRecruiterId,
      language,
      responsibilities,
      requirements,
      perks,
      departmentId,
      ...rest
    } = dto;

    const prismaLanguage = language
      ? (language.toUpperCase() as JobLanguage)
      : undefined;

    const prismaRequirements = requirements
      ? (requirements.toUpperCase() as RequirementsLevel)
      : undefined;

    const data: Prisma.JobUpdateInput = {
      ...rest,
      applicationClosingDate: applicationClosingDate
        ? new Date(applicationClosingDate)
        : undefined,
      recruiter:
        recruiterId !== undefined || assignedRecruiterId !== undefined
          ? { connect: { id: recruiterId ?? assignedRecruiterId } }
          : undefined,
      language: prismaLanguage,
      responsibilities,
      requirements: prismaRequirements,
      perks,
      department: departmentId
        ? { connect: { id: departmentId } }
        : departmentId === null
        ? { disconnect: true }
        : undefined,
    };

    return this.prisma.runWithOrgContext(ctx.companyId, (tx) =>
      tx.job.update({
        where: { id: jobId },
        data,
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
   * Keywords and weight can be sent in sequence: one request may have only keywords
   * (weights null), another only weights (keywords null). Each update merges into
   * existing data and does not overwrite the other.
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

    await this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      for (const v of dto.values) {
        const coreValue = await tx.coreValue.findFirst({
          where: { name: v.dimension, isActive: true },
          select: { id: true },
        });
        if (!coreValue) continue;

        const coreValueId = coreValue.id;

        if (v.keywords !== undefined) {
          await tx.jobCoreValueKeyword.deleteMany({
            where: { jobId, coreValueId },
          });
          const keywords = v.keywords.filter((k) => k.trim() !== '');
          if (keywords.length > 0) {
            await tx.jobCoreValueKeyword.createMany({
              data: keywords.map((keyword) => ({
                jobId,
                coreValueId,
                keyword: keyword.trim(),
              })),
              skipDuplicates: true,
            });
          }
        }

        if (v.weight !== undefined) {
          const weightInt = Math.round(Number(v.weight));
          await tx.jobCoreValueWeighting.upsert({
            where: {
              jobId_coreValueId: { jobId, coreValueId },
            },
            create: { jobId, coreValueId, weight: weightInt },
            update: { weight: weightInt },
          });
        }
      }
    });

    return { success: true };
  }

  /**
   * Save job benchmark. Recruiter: only if own or assigned; Admin/HM: any job in org.
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
      // Upsert the root benchmark profile (one per job, find-or-create).
      const existingProfile = await tx.jobBenchmarkProfile.findFirst({
        where: { jobId },
        select: { id: true },
      });

      let benchmarkId: number;

      if (existingProfile) {
        await tx.jobBenchmarkProfile.update({
          where: { id: existingProfile.id },
          data: {
            jobPostRole: dto.jobPostRole ?? undefined,
            benchmarkRole: dto.benchmarkRole ?? undefined,
          },
        });
        benchmarkId = existingProfile.id;
      } else {
        const created = await tx.jobBenchmarkProfile.create({
          data: {
            jobId,
            jobPostRole: dto.jobPostRole ?? '',
            benchmarkRole: dto.benchmarkRole ?? undefined,
          },
          select: { id: true },
        });
        benchmarkId = created.id;
      }

      // Replace core values: delete existing, recreate from DTO.
      if (dto.coreValues !== undefined) {
        await tx.jobBenchmarkCoreValue.deleteMany({ where: { benchmarkId } });
        const coreValueEntries: { benchmarkId: number; coreValueId: number; weight: number }[] = [];
        for (const cv of dto.coreValues) {
          const trimmedName = cv.value?.trim();
          if (!trimmedName) continue;
          const coreValue = await tx.coreValue.upsert({
            where: { name: trimmedName },
            create: { name: trimmedName, category: 'Benchmark', isActive: true },
            update: { isActive: true },
            select: { id: true },
          });
          coreValueEntries.push({
            benchmarkId,
            coreValueId: coreValue.id,
            weight: cv.weight ?? 0,
          });
        }
        if (coreValueEntries.length > 0) {
          await tx.jobBenchmarkCoreValue.createMany({
            data: coreValueEntries,
            skipDuplicates: true,
          });
        }
      }

      // Replace team style tags: delete existing, recreate from DTO.
      if (dto.teamStyleTags !== undefined) {
        await tx.jobBenchmarkTeamStyleTag.deleteMany({ where: { benchmarkId } });
        const tags = dto.teamStyleTags.filter((t) => t.trim() !== '');
        if (tags.length > 0) {
          await tx.jobBenchmarkTeamStyleTag.createMany({
            data: tags.map((tag) => ({ benchmarkId, tag: tag.trim() })),
          });
        }
      }

      // Upsert fit-priority when at least one enum field is supplied.
      const toEnum = (v: string) => v.toUpperCase().replace(/-/g, '_');
      const hiringFocus = dto.hiringFocus
        ? (toEnum(dto.hiringFocus) as HiringFocus)
        : undefined;
      const devStrategy = dto.developmentStrategy
        ? (toEnum(dto.developmentStrategy) as DevelopmentStrategy)
        : undefined;
      const longTerm = dto.longTermAlignment
        ? (toEnum(dto.longTermAlignment) as LongTermAlignment)
        : undefined;

      if (hiringFocus && devStrategy && longTerm) {
        await tx.jobBenchmarkFitPriority.upsert({
          where: { benchmarkId },
          create: { benchmarkId, hiringFocus, devStrategy, longTerm },
          update: { hiringFocus, devStrategy, longTerm },
        });
      }
    });

    return { success: true };
  }
}
