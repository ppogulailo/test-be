import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { CurrentOrgId } from '../common/context/auth-context.decorators';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ApplicationsService } from './applications.service';

@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  /** Read endpoint: list applications for current org (pipeline). Requires job:read. */
  @Get()
  @RequirePermission('job:read')
  list(
    @CurrentOrgId() orgId: string,
    @Query('jobId') jobId?: string,
  ) {
    const companyId = parseInt(orgId, 10);
    const jobIdNum = jobId ? parseInt(jobId, 10) : undefined;
    return this.applications.list(companyId, jobIdNum);
  }
}
