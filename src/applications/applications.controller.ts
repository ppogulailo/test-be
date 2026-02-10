import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
  Body,
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
import { MoveApplicationStageDto } from './dto/move-stage.dto';

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

  @Post(':id/move-stage')
  @RequirePermission('pipeline:move_stage')
  @ApiOperation({
    summary:
      'Move application to a pipeline stage (HM/Admin: org-wide; Recruiter: only own/assigned jobs)',
  })
  @ApiResponse({ status: 200, description: 'Application moved' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  moveStage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoveApplicationStageDto,
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.applications.moveStage(
      {
        companyId: Number(auth.currentOrgId),
        userId: Number(auth.userId),
        roleKey: auth.roleKey,
      },
      id,
      dto.stageId,
    );
  }
}
