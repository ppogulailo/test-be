import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/auth.types';
import { CandidatePortalService } from './candidate-portal.service';

@ApiTags('candidate-portal')
@UseGuards(JwtAuthGuard)
@Controller('candidate-portal')
export class CandidatePortalController {
  constructor(private readonly service: CandidatePortalService) {}

  // ── Dashboard ─────────────────────────────────────────────────────────────

  @Get('dashboard/metrics')
  @ApiOperation({ summary: 'Candidate dashboard metrics' })
  getMetrics(@CurrentUser() user: RequestUser) {
    return this.service.getMetrics(user.userId);
  }

  @Get('dashboard/applications')
  @ApiOperation({ summary: 'Candidate applications list' })
  getApplications(@CurrentUser() user: RequestUser) {
    return this.service.getApplications(user.userId);
  }

  @Get('dashboard/job-alerts')
  @ApiOperation({ summary: 'Recommended live job listings for candidate' })
  getJobAlerts(@CurrentUser() user: RequestUser) {
    return this.service.getJobAlerts(user.userId);
  }

  @Get('dashboard/interviews/upcoming')
  @ApiOperation({ summary: 'Upcoming interviews for candidate (next 30 days)' })
  getUpcomingInterviews(@CurrentUser() user: RequestUser) {
    return this.service.getUpcomingInterviews(user.userId);
  }

  // ── Jobs ──────────────────────────────────────────────────────────────────

  @Get('jobs')
  @ApiOperation({ summary: 'List all live jobs for candidate portal' })
  @ApiResponse({ status: 200, description: 'Array of live jobs' })
  getJobListings() {
    return this.service.getJobListings();
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get single live job details' })
  @ApiResponse({ status: 200, description: 'Job detail object' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  getJobById(@Param('id', ParseIntPipe) id: number) {
    return this.service.getJobById(id);
  }

  @Post('jobs/:id/apply')
  @ApiOperation({ summary: 'Apply to a job as candidate' })
  @ApiResponse({ status: 201, description: 'Application created' })
  applyToJob(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.applyToJob(user.userId, id);
  }

  // ── Current User ──────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get current candidate user profile' })
  getCurrentUser(@CurrentUser() user: RequestUser) {
    return this.service.getCurrentUser(user.userId);
  }

  @Patch('me/language')
  @ApiOperation({ summary: 'Update preferred language for current candidate' })
  updateLanguage(
    @CurrentUser() user: RequestUser,
    @Body() body: { language: string },
  ) {
    return this.service.updateLanguagePreference(user.userId, body.language);
  }

  @Get('me/quick-actions')
  @ApiOperation({ summary: 'Get user + MVM status for quick actions' })
  getQuickActionsData(@CurrentUser() user: RequestUser) {
    return this.service.getQuickActionsData(user.userId);
  }
}
