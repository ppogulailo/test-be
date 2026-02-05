import {
  Controller,
  Get,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
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
  @ApiOperation({
    summary:
      'List applications (Admin/HM/Viewer: org-wide; Recruiter: jobs own/assigned)',
  })
  @ApiQuery({
    name: 'jobId',
    required: false,
    type: Number,
    description: 'Filter by job id',
  })
  @ApiResponse({ status: 200, description: 'List of applications' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'No org context or missing job:read',
  })
  list(
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
    @Query('jobId', new ParseIntPipe({ optional: true })) jobId?: number,
  ) {
    const ctx = {
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    };

    return this.applications.list(ctx, jobId);
  }
}
