import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Applications (pipeline) scoped by current org. No query returns cross-org data.
 */
@Injectable()
export class ApplicationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * List applications for the current org only. Scoped by companyId.
   */
  async list(companyId: number, jobId?: number) {
    return this.prisma.runWithOrgContext(companyId, (tx) =>
      tx.application.findMany({
        where: {
          companyId,
          ...(jobId !== undefined ? { jobId } : {}),
        },
        select: {
          id: true,
          jobId: true,
          candidateProfileId: true,
          companyId: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
        },
        orderBy: { updatedAt: 'desc' },
      }),
    );
  }
}
