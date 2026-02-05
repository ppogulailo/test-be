import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthCtx } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';

@ApiTags('jobs')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  private toScopeContext(auth: {
    currentOrgId: string;
    userId: string;
    roleKey: string;
  }) {
    return {
      companyId: parseInt(auth.currentOrgId, 10),
      userId: parseInt(auth.userId, 10),
      roleKey: auth.roleKey,
    };
  }

  @Get()
  @RequirePermission('job:read')
  @ApiOperation({
    summary:
      'List jobs (Admin/HM/Viewer: org-wide; Recruiter: own or assigned)',
  })
  @ApiResponse({ status: 200, description: 'List of jobs' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'No org context or missing job:read',
  })
  list(
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.jobs.list(this.toScopeContext(auth));
  }

  @Get(':id')
  @RequirePermission('job:read')
  @ApiOperation({ summary: 'Get one job (Recruiter: only if own or assigned)' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'Job in other org or Recruiter not own/assigned',
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getOne(
    @Param('id', ParseIntPipe) id: number,
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.jobs.getOne(id, this.toScopeContext(auth));
  }

  @Post()
  @RequirePermission('job:create')
  @ApiOperation({
    summary: 'Create job in current org (Recruiter becomes owner)',
  })
  @ApiResponse({ status: 201, description: 'Created job' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description: 'No org context or missing job:create',
  })
  create(
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
    @Body() dto: CreateJobDto,
  ) {
    return this.jobs.create(this.toScopeContext(auth), dto);
  }

  @Post('publish')
  @RequirePermission('job:publish')
  @ApiOperation({ summary: 'Publish job (Recruiter: only if own or assigned)' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['jobId'],
      properties: { jobId: { type: 'number' } },
    },
  })
  @ApiResponse({ status: 200, description: 'Job published' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description:
      'No org context, missing job:publish, or Recruiter not own/assigned',
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  publishByBody(
    @Body('jobId', ParseIntPipe) jobId: number,
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.jobs.publish(jobId, this.toScopeContext(auth));
  }

  @Post(':id/publish')
  @RequirePermission('job:publish')
  @ApiOperation({
    summary: 'Publish job by path (Recruiter: only if own or assigned)',
  })
  @ApiResponse({ status: 200, description: 'Job published' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({
    status: 403,
    description:
      'No org context, missing job:publish, or Recruiter not own/assigned',
  })
  @ApiResponse({ status: 404, description: 'Job not found' })
  publishById(
    @Param('id', ParseIntPipe) id: number,
    @AuthCtx() auth: { currentOrgId: string; userId: string; roleKey: string },
  ) {
    return this.jobs.publish(id, this.toScopeContext(auth));
  }
}
