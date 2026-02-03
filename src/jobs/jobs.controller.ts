import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentOrgId } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { JobsService } from './jobs.service';
import { CreateJobDto } from './dto/create-job.dto';

@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  /** Read endpoint: list jobs for current org. Requires job:read. */
  @Get()
  @RequirePermission('job:read')
  list(@CurrentOrgId() orgId: string) {
    return this.jobs.list(parseInt(orgId, 10));
  }

  /** Get one job by id. 403 if job belongs to another org. */
  @Get(':id')
  @RequirePermission('job:read')
  getOne(@Param('id', ParseIntPipe) id: number, @CurrentOrgId() orgId: string) {
    return this.jobs.getOne(id, parseInt(orgId, 10));
  }

  /** Write endpoint: create job in current org. Requires job:create. */
  @Post()
  @RequirePermission('job:create')
  create(@CurrentOrgId() orgId: string, @Body() dto: CreateJobDto) {
    return this.jobs.create(parseInt(orgId, 10), dto);
  }

  /** Publish by jobId in body. Must be before :id/publish so "publish" is not captured as id. */
  @Post('publish')
  @RequirePermission('job:publish')
  publishByBody(
    @Body('jobId', ParseIntPipe) jobId: number,
    @CurrentOrgId() orgId: string,
  ) {
    return this.jobs.publish(jobId, parseInt(orgId, 10));
  }

  /** Publish by id in path. */
  @Post(':id/publish')
  @RequirePermission('job:publish')
  publishById(
    @Param('id', ParseIntPipe) id: number,
    @CurrentOrgId() orgId: string,
  ) {
    return this.jobs.publish(id, parseInt(orgId, 10));
  }
}
