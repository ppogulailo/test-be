import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertOrgAccess } from '../common/rbac/org-access.util';
import type { CreateJobDto } from './dto/create-job.dto';

@Injectable()
export class JobsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List jobs for the current org only. All queries scoped by companyId.
   */
  async list(companyId: number) {
    return this.prisma.runWithOrgContext(companyId, (tx) =>
      tx.job.findMany({
        where: { companyId },
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
   * Get one job by id. Throws if not in current org. Uses RLS so wrong org gets no row.
   */
  async getOne(jobId: number, companyId: number) {
    const job = await this.prisma.runWithOrgContext(companyId, (tx) =>
      tx.job.findFirst({
        where: { id: jobId },
        select: {
          id: true,
          title: true,
          status: true,
          companyId: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    );
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    assertOrgAccess(job.companyId, companyId);
    return job;
  }

  /**
   * Create a job in the current org. Scoped by companyId.
   */
  async create(companyId: number, dto: CreateJobDto) {
    return this.prisma.runWithOrgContext(companyId, (tx) =>
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
          companyId,
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
   * Publish a job (set status to LIVE). Fails if job is not in current org.
   */
  async publish(jobId: number, companyId: number) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId },
      select: { id: true, companyId: true },
    });
    if (!job) {
      throw new NotFoundException('Job not found');
    }
    assertOrgAccess(job.companyId, companyId);

    return this.prisma.runWithOrgContext(companyId, (tx) =>
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
