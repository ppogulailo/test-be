import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { isOrgWideScope, jobWhereForScope } from '../common/rbac/scope.util';

export type DashboardContext = {
  companyId: number;
  userId: number;
  roleKey: string;
};

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getRecruiterDashboard(ctx: DashboardContext) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      return this._fetchDashboard(ctx, tx);
    });
  }

  private async _fetchDashboard(
    ctx: DashboardContext,
    tx: Prisma.TransactionClient,
  ) {
    // Resolve job scope: Recruiter sees own/assigned jobs; Admin/HM sees org-wide
    const jobWhere = isOrgWideScope(ctx.roleKey)
      ? { companyId: ctx.companyId }
      : jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);

    const scopedJobs = await tx.job.findMany({
      where: jobWhere,
      select: { id: true, title: true, status: true, publishedAt: true },
    });

    const allJobIds = scopedJobs.map((j) => j.id);
    const activeJobIds = scopedJobs
      .filter((j) => j.status === 'LIVE')
      .map((j) => j.id);

    if (allJobIds.length === 0) {
      return this.emptyDashboard();
    }

    // Run all queries in parallel
    const [
      applications,
      recentHistories,
      upcomingInterviews,
      performanceEntries,
      topJobStats,
    ] = await Promise.all([
      // Application status breakdown
      tx.application.findMany({
        where: { companyId: ctx.companyId, jobId: { in: allJobIds } },
        select: { status: true, jobId: true },
      }),

      // Recent pipeline activity (last 10 moves)
      tx.applicationHistory.findMany({
        where: {
          application: {
            companyId: ctx.companyId,
            jobId: { in: allJobIds },
          },
        },
        select: {
          changedAt: true,
          toStage: { select: { name: true, type: true } },
          application: {
            select: { job: { select: { title: true } } },
          },
        },
        orderBy: { changedAt: 'desc' },
        take: 10,
      }),

      // Upcoming interviews (next 7 days)
      tx.interview.findMany({
        where: {
          application: {
            companyId: ctx.companyId,
            jobId: { in: allJobIds },
          },
          scheduledAt: {
            gte: new Date(),
            lte: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          status: { not: 'CANCELED' },
        },
        select: {
          id: true,
          scheduledAt: true,
          type: true,
          status: true,
          application: {
            select: {
              candidateProfile: {
                select: { firstName: true, lastName: true },
              },
              job: { select: { title: true } },
            },
          },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      }),

      // Performance log entries for last 30 days
      tx.recruiterPerformanceLog.findMany({
        where: {
          companyId: ctx.companyId,
          ...(isOrgWideScope(ctx.roleKey) ? {} : { recruiterId: ctx.userId }),
          loggedAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
          jobId: { in: allJobIds },
        },
        select: { activityType: true },
      }),

      // Top jobs by applicant count (from JobStats)
      tx.jobStats.findMany({
        where: { jobId: { in: activeJobIds } },
        select: {
          jobId: true,
          applicantCount: true,
          shortlistedCount: true,
          interviewedCount: true,
          offeredCount: true,
          hiredCount: true,
          lastCalculatedAt: true,
          job: { select: { title: true, publishedAt: true } },
        },
        orderBy: { applicantCount: 'desc' },
        take: 5,
      }),
    ]);

    // Aggregate application counts by status
    const totalApplicants = applications.length;
    const stageBreakdown = applications.reduce<Record<string, number>>(
      (acc, app) => {
        acc[app.status] = (acc[app.status] ?? 0) + 1;
        return acc;
      },
      {},
    );

    // Recent activity feed
    const recentActivity = recentHistories.map((h) => ({
      jobTitle: h.application.job.title,
      action: 'pipeline_moved' as const,
      stageName: h.toStage?.name ?? null,
      at: h.changedAt,
    }));

    // Upcoming interview list
    const interviews = upcomingInterviews.map((i) => ({
      id: String(i.id),
      scheduledAt: i.scheduledAt,
      type: i.type as string,
      candidateName: i.application.candidateProfile
        ? `${i.application.candidateProfile.firstName} ${i.application.candidateProfile.lastName}`
        : 'Unknown',
      jobTitle: i.application.job.title,
    }));

    // Performance counters from log entries
    const activityCounts = performanceEntries.reduce<Record<string, number>>(
      (acc, e) => {
        acc[e.activityType] = (acc[e.activityType] ?? 0) + 1;
        return acc;
      },
      {},
    );
    const performanceLogs = {
      pipelineMoves: activityCounts['pipeline_moved'] ?? 0,
      interviewsScheduled: activityCounts['interview_scheduled'] ?? 0,
      offersSent: activityCounts['offer_sent'] ?? 0,
      candidatesShortlisted: activityCounts['candidate_shortlisted'] ?? 0,
    };

    // Top jobs shape
    const topJobs = topJobStats.map((s) => ({
      jobId: s.jobId,
      title: s.job.title,
      publishedAt: s.job.publishedAt,
      applicantCount: s.applicantCount,
      shortlistedCount: s.shortlistedCount,
      interviewedCount: s.interviewedCount,
      offeredCount: s.offeredCount,
      hiredCount: s.hiredCount,
      lastCalculatedAt: s.lastCalculatedAt,
      // progress: percentage of applicants that reached interview
      progress:
        s.applicantCount > 0
          ? Math.round((s.interviewedCount / s.applicantCount) * 100)
          : 0,
    }));

    return {
      activeJobs: activeJobIds.length,
      totalApplicants,
      stageBreakdown,
      recentActivity,
      upcomingInterviews: interviews,
      topJobs,
      performanceLogs,
    };
  }

  private emptyDashboard() {
    return {
      activeJobs: 0,
      totalApplicants: 0,
      stageBreakdown: {},
      recentActivity: [],
      upcomingInterviews: [],
      topJobs: [],
      performanceLogs: {
        pipelineMoves: 0,
        interviewsScheduled: 0,
        offersSent: 0,
        candidatesShortlisted: 0,
      },
    };
  }
}
