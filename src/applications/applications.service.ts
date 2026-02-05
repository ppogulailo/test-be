import { Injectable } from '@nestjs/common';
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
}
