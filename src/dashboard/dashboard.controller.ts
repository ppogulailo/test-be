import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthCtx } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('recruiter')
  @RequirePermission('analytics:dashboard')
  @ApiOperation({
    summary:
      'Recruiter dashboard metrics — own/assigned jobs for Recruiter, org-wide for Admin/HM',
  })
  @ApiResponse({
    status: 200,
    description:
      'Dashboard data: active jobs, applicant counts, stage breakdown, recent activity, upcoming interviews, top jobs, performance logs',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getRecruiterDashboard(
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.dashboard.getRecruiterDashboard({
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    });
  }
}
