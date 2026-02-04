import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { CurrentOrgId } from '../common/context/auth-context.decorators';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { ApplicationsService } from './applications.service';

@ApiTags('applications')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Get()
  @RequirePermission('job:read')
  @ApiOperation({ summary: 'List applications for current org (pipeline)' })
  @ApiQuery({ name: 'jobId', required: false, type: Number, description: 'Filter by job id' })
  @ApiResponse({ status: 200, description: 'List of applications (current org only)' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No org context or missing job:read' })
  list(
    @CurrentOrgId() orgId: string,
    @Query('jobId') jobId?: string,
  ) {
    const companyId = parseInt(orgId, 10);
    const jobIdNum = jobId ? parseInt(jobId, 10) : undefined;
    return this.applications.list(companyId, jobIdNum);
  }
}
