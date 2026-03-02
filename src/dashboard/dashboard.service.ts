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
              id: true,
              jobId: true,
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
      applicationId: i.application.id,
      jobId: i.application.jobId,
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

    // Month-over-month trends
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    const [thisMonthApps, lastMonthApps, thisWeekInterviews, lastWeekInterviews, hiredApps, jobApprovalCount, feedbackPendingCount] =
      await Promise.all([
        tx.application.count({
          where: {
            companyId: ctx.companyId,
            jobId: { in: allJobIds },
            submittedAt: { gte: thisMonthStart },
          },
        }),
        tx.application.count({
          where: {
            companyId: ctx.companyId,
            jobId: { in: allJobIds },
            submittedAt: { gte: lastMonthStart, lt: thisMonthStart },
          },
        }),
        tx.interview.count({
          where: {
            application: {
              companyId: ctx.companyId,
              jobId: { in: allJobIds },
            },
            scheduledAt: { gte: oneWeekAgo, lte: now },
            status: { not: 'CANCELED' },
          },
        }),
        tx.interview.count({
          where: {
            application: {
              companyId: ctx.companyId,
              jobId: { in: allJobIds },
            },
            scheduledAt: { gte: twoWeeksAgo, lt: oneWeekAgo },
            status: { not: 'CANCELED' },
          },
        }),
        tx.application.findMany({
          where: {
            companyId: ctx.companyId,
            jobId: { in: allJobIds },
            status: 'HIRED',
            hiredAt: { not: null },
          },
          select: { submittedAt: true, hiredAt: true },
        }),
        tx.job.count({
          where: {
            ...jobWhere,
            approvalRequestedAt: { not: null },
            approvedAt: null,
            rejectedAt: null,
          },
        }),
        tx.feedbackTask.count({
          where: {
            companyId: ctx.companyId,
            moment: 'T0_POST_INTERVIEW',
            status: 'PENDING',
            jobId: { in: allJobIds },
          },
        }),
      ]);

    const timeToHireDays =
      hiredApps.length > 0
        ? Math.round(
            hiredApps.reduce((sum, a) => {
              const sub = a.submittedAt?.getTime() ?? 0;
              const hired = (a.hiredAt as Date)?.getTime() ?? 0;
              return sum + (hired && sub ? (hired - sub) / (1000 * 60 * 60 * 24) : 0);
            }, 0) / hiredApps.length,
          )
        : 0;

    const offerApprovalPending = stageBreakdown['OFFERED'] ?? 0;

    const trend = (
      current: number,
      previous: number,
    ): { direction: 'up' | 'down' | 'same'; diff: number; text: string } => {
      const diff = current - previous;
      if (diff > 0) return { direction: 'up', diff, text: `${diff} more than last month` };
      if (diff < 0) return { direction: 'down', diff: -diff, text: `${-diff} fewer than last month` };
      return { direction: 'same', diff: 0, text: 'Same as last month' };
    };

    const totalApplicantsTrend = trend(totalApplicants, lastMonthApps);
    const activeJobsTrend = { direction: 'same' as const, diff: 0, text: 'Same as last month' };
    const interviewsTrend = trend(thisWeekInterviews, lastWeekInterviews);

    // Hiring insights time series (last 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [appSubmissions, histories, hiredWithDate] = await Promise.all([
      tx.application.findMany({
        where: {
          companyId: ctx.companyId,
          jobId: { in: allJobIds },
          submittedAt: { lte: now },
        },
        select: { id: true, submittedAt: true },
      }),
      tx.applicationHistory.findMany({
        where: {
          application: {
            companyId: ctx.companyId,
            jobId: { in: allJobIds },
          },
          changedAt: { gte: thirtyDaysAgo },
          toStageId: { not: null },
        },
        select: {
          applicationId: true,
          changedAt: true,
          toStage: { select: { type: true } },
        },
      }),
      tx.application.findMany({
        where: {
          companyId: ctx.companyId,
          jobId: { in: allJobIds },
          status: 'HIRED',
          hiredAt: { not: null },
        },
        select: { id: true, hiredAt: true },
      }),
    ]);

    const historyRows = histories
      .filter((h) => h.toStage?.type)
      .map((h) => ({
        applicationId: h.applicationId,
        changedAt: h.changedAt,
        type: h.toStage!.type,
      }));

    const hiringInsightsTimeSeries: Array<{
      date: string;
      applicationToInterviewRate: number;
      offerAcceptanceRate: number;
      rejectionRate: number;
    }> = [];

    for (let i = 0; i < 30; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - (29 - i));
      d.setHours(23, 59, 59, 999);
      const dateKey = d.toISOString().slice(0, 10);
      const dayLabel = dateKey.slice(8, 10);

      const cumApps = appSubmissions.filter(
        (a) => a.submittedAt && a.submittedAt <= d,
      ).length;
      const cumInterview = new Set(
        historyRows
          .filter((r) => r.type === 'INTERVIEW' && r.changedAt <= d)
          .map((r) => r.applicationId),
      ).size;
      const cumOffer = new Set(
        historyRows
          .filter((r) => r.type === 'OFFER' && r.changedAt <= d)
          .map((r) => r.applicationId),
      ).size;
      const cumReject = new Set(
        historyRows
          .filter((r) => r.type === 'REJECT' && r.changedAt <= d)
          .map((r) => r.applicationId),
      ).size;
      const cumHired = hiredWithDate.filter(
        (a) => a.hiredAt && a.hiredAt <= d,
      ).length;

      hiringInsightsTimeSeries.push({
        date: dayLabel,
        applicationToInterviewRate:
          cumApps > 0 ? Math.round((cumInterview / cumApps) * 100) : 0,
        offerAcceptanceRate:
          cumOffer > 0 ? Math.round((cumHired / cumOffer) * 100) : 0,
        rejectionRate:
          cumApps > 0 ? Math.round((cumReject / cumApps) * 100) : 0,
      });
    }

    return {
      activeJobs: activeJobIds.length,
      totalApplicants,
      stageBreakdown,
      recentActivity,
      upcomingInterviews: interviews,
      topJobs,
      performanceLogs,
      summaryTrends: {
        totalApplicants: { ...totalApplicantsTrend, current: totalApplicants, previous: lastMonthApps },
        activeJobs: { ...activeJobsTrend, current: activeJobIds.length, previous: activeJobIds.length },
        interviewsThisWeek: { ...interviewsTrend, current: thisWeekInterviews, previous: lastWeekInterviews },
        timeToHire: {
          value: timeToHireDays,
          direction: 'same' as const,
          text: 'Same as last month',
        },
      },
      todoCounts: {
        jobApprovalPending: jobApprovalCount,
        interviewFeedbackPending: feedbackPendingCount,
        offerApprovalPending,
      },
      hiringInsightsTimeSeries,
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
      summaryTrends: {
        totalApplicants: { current: 0, previous: 0, direction: 'same' as const, diff: 0, text: 'Same as last month' },
        activeJobs: { current: 0, previous: 0, direction: 'same' as const, diff: 0, text: 'Same as last month' },
        interviewsThisWeek: { current: 0, previous: 0, direction: 'same' as const, diff: 0, text: 'Same as last month' },
        timeToHire: { value: 0, direction: 'same' as const, text: 'Same as last month' },
      },
      todoCounts: {
        jobApprovalPending: 0,
        interviewFeedbackPending: 0,
        offerApprovalPending: 0,
      },
      hiringInsightsTimeSeries: [],
    };
  }
}
