import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthCtx } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
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
  @ApiOperation({ summary: 'List applications (Admin/HM/Viewer: org-wide; Recruiter: jobs own/assigned)' })
  @ApiQuery({ name: 'jobId', required: false, type: Number, description: 'Filter by job id' })
  @ApiResponse({ status: 200, description: 'List of applications' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No org context or missing job:read' })
  list(
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
    @Query('jobId') jobId?: string,
  ) {
    const ctx = {
      companyId: parseInt(auth.currentOrgId, 10),
      userId: parseInt(auth.userId, 10),
      roleKey: auth.roleKey,
    };
    const jobIdNum = jobId ? parseInt(jobId, 10) : undefined;
    return this.applications.list(ctx, jobIdNum);
  }
}
