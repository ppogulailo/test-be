import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentOrgId } from '../common/context/auth-context.decorators';
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

  @Get()
  @RequirePermission('job:read')
  @ApiOperation({ summary: 'List jobs for current org' })
  @ApiResponse({ status: 200, description: 'List of jobs (current org only)' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No org context or missing job:read' })
  list(@CurrentOrgId() orgId: string) {
    return this.jobs.list(parseInt(orgId, 10));
  }

  @Get(':id')
  @RequirePermission('job:read')
  @ApiOperation({ summary: 'Get one job by id' })
  @ApiResponse({ status: 200, description: 'Job details' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'Job belongs to another org' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentOrgId() orgId: string) {
    return this.jobs.getOne(id, parseInt(orgId, 10));
  }

  @Post()
  @RequirePermission('job:create')
  @ApiOperation({ summary: 'Create job in current org' })
  @ApiResponse({ status: 201, description: 'Created job' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No org context or missing job:create' })
  create(@CurrentOrgId() orgId: string, @Body() dto: CreateJobDto) {
    return this.jobs.create(parseInt(orgId, 10), dto);
  }

  @Post('publish')
  @RequirePermission('job:publish')
  @ApiOperation({ summary: 'Publish job by id (body)' })
  @ApiBody({ schema: { type: 'object', required: ['jobId'], properties: { jobId: { type: 'number' } } } })
  @ApiResponse({ status: 200, description: 'Job published' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No org context, missing job:publish, or job in another org' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  publishByBody(
    @Body('jobId', ParseIntPipe) jobId: number,
    @CurrentOrgId() orgId: string,
  ) {
    return this.jobs.publish(jobId, parseInt(orgId, 10));
  }

  @Post(':id/publish')
  @RequirePermission('job:publish')
  @ApiOperation({ summary: 'Publish job by id (path)' })
  @ApiResponse({ status: 200, description: 'Job published' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, description: 'No org context, missing job:publish, or job in another org' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  publishById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentOrgId() orgId: string,
  ) {
    return this.jobs.publish(id, parseInt(orgId, 10));
  }
}
