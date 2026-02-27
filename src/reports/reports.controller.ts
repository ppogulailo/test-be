import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthCtx } from '../common/context/auth-context.decorators';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { ReportsService } from './reports.service';

type AuthContext = { currentOrgId: string; userId: string; roleKey: string };

@ApiTags('reports')
@ApiBearerAuth('access_token')
@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  // ── GET /reports/list ─────────────────────────────────────────────────────

  @Get('list')
  @RequirePermission('analytics:dashboard')
  @ApiOperation({ summary: 'List available report templates' })
  @ApiResponse({ status: 200, description: 'Array of report catalogue entries' })
  getReportsList(@AuthCtx() auth: AuthContext) {
    return this.reports.getReportsList({
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    });
  }

  // ── POST /reports/templates ───────────────────────────────────────────────

  @Post('templates')
  @RequirePermission('analytics:dashboard')
  @ApiOperation({ summary: 'Create a new report template' })
  @ApiResponse({ status: 201, description: 'Created report template' })
  createTemplate(
    @AuthCtx() auth: AuthContext,
    @Body()
    body: {
      title: string;
      description: string;
      exportType: string;
      format: string;
      tag?: string;
    },
  ) {
    return this.reports.createTemplate(
      {
        companyId: Number(auth.currentOrgId),
        userId: Number(auth.userId),
        roleKey: auth.roleKey,
      },
      body,
    );
  }

  // ── DELETE /reports/templates/:id ────────────────────────────────────────

  @Delete('templates/:id')
  @RequirePermission('analytics:dashboard')
  @ApiOperation({ summary: 'Delete a report template' })
  @ApiResponse({ status: 200, description: '{ id }' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async deleteTemplate(
    @AuthCtx() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const result = await this.reports.deleteTemplate(
      {
        companyId: Number(auth.currentOrgId),
        userId: Number(auth.userId),
        roleKey: auth.roleKey,
      },
      Number(id),
    );
    if (!result) throw new NotFoundException('Report template not found');
    return result;
  }

  // ── PATCH /reports/templates/:id/refresh ─────────────────────────────────

  @Patch('templates/:id/refresh')
  @RequirePermission('analytics:dashboard')
  @ApiOperation({ summary: 'Mark a report template as freshly generated (bumps generatedAt)' })
  @ApiResponse({ status: 200, description: '{ id, generatedAt }' })
  @ApiResponse({ status: 404, description: 'Template not found' })
  async refreshTemplate(
    @AuthCtx() auth: AuthContext,
    @Param('id') id: string,
  ) {
    const result = await this.reports.touchTemplate(
      {
        companyId: Number(auth.currentOrgId),
        userId: Number(auth.userId),
        roleKey: auth.roleKey,
      },
      Number(id),
    );
    if (!result) throw new NotFoundException('Report template not found');
    return result;
  }

  // ── GET /reports/applications/export ──────────────────────────────────────

  @Get('applications/export')
  @RequirePermission('analytics:view')
  @ApiOperation({
    summary: 'Export applications as CSV or JSON',
    description:
      'Scoped by role: Recruiter sees own/assigned jobs only; Admin/HM sees org-wide.',
  })
  @ApiQuery({ name: 'jobId', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, type: String })
  @ApiQuery({ name: 'stageId', required: false, type: Number })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'json'] })
  @ApiResponse({ status: 200, description: 'Application export data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportApplications(
    @AuthCtx() auth: AuthContext,
    @Query('jobId') jobId?: string,
    @Query('status') status?: string,
    @Query('stageId') stageId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('format') format: 'csv' | 'json' = 'json',
    @Res() res?: Response,
  ) {
    const ctx = {
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    };

    const result = await this.reports.exportApplications(ctx, {
      jobId: jobId ? Number(jobId) : undefined,
      status,
      stageId: stageId ? Number(stageId) : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      format,
    });

    if (format === 'csv') {
      const csv = this.reports.applicationsToCsv(result.rows);
      res!.setHeader('Content-Type', 'text/csv');
      res!.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
      return res!.send(csv);
    }

    // JSON — force download instead of browser inline view
    res!.setHeader('Content-Type', 'application/json');
    res!.setHeader('Content-Disposition', 'attachment; filename="applications.json"');
    return res!.send(JSON.stringify({ data: result.rows, count: result.rows.length }, null, 2));
  }

  // ── GET /reports/pipeline/export ─────────────────────────────────────────

  @Get('pipeline/export')
  @RequirePermission('analytics:view')
  @ApiOperation({
    summary: 'Export pipeline history as CSV or JSON',
    description:
      'Returns ApplicationHistory rows: stage transitions per candidate. Useful for time-in-stage auditing.',
  })
  @ApiQuery({ name: 'jobId', required: false, type: Number })
  @ApiQuery({ name: 'fromDate', required: false, type: String })
  @ApiQuery({ name: 'toDate', required: false, type: String })
  @ApiQuery({ name: 'format', required: false, enum: ['csv', 'json'] })
  @ApiResponse({ status: 200, description: 'Pipeline history export data' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  async exportPipelineHistory(
    @AuthCtx() auth: AuthContext,
    @Query('jobId') jobId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('format') format: 'csv' | 'json' = 'json',
    @Res() res?: Response,
  ) {
    const ctx = {
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    };

    const result = await this.reports.exportPipelineHistory(ctx, {
      jobId: jobId ? Number(jobId) : undefined,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      format,
    });

    if (format === 'csv') {
      const csv = this.reports.pipelineHistoryToCsv(result.rows);
      res!.setHeader('Content-Type', 'text/csv');
      res!.setHeader('Content-Disposition', 'attachment; filename="pipeline-history.csv"');
      return res!.send(csv);
    }

    // JSON — force download instead of browser inline view
    res!.setHeader('Content-Type', 'application/json');
    res!.setHeader('Content-Disposition', 'attachment; filename="pipeline-history.json"');
    return res!.send(JSON.stringify({ data: result.rows, count: result.rows.length }, null, 2));
  }

  // ── GET /reports/summary ─────────────────────────────────────────────────

  @Get('summary')
  @RequirePermission('analytics:dashboard')
  @ApiOperation({
    summary: 'Aggregated analytics summary',
    description:
      'Returns funnel counts, avg time-in-stage, overall conversion rate, and top jobs. Available to Recruiter and above.',
  })
  @ApiResponse({
    status: 200,
    description:
      'funnel, funnelPct, avgTimeInStage, conversionRate, topJobs, generatedAt',
  })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getSummary(@AuthCtx() auth: AuthContext) {
    return this.reports.getSummary({
      companyId: Number(auth.currentOrgId),
      userId: Number(auth.userId),
      roleKey: auth.roleKey,
    });
  }
}
