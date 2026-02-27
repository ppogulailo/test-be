import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { isOrgWideScope, jobWhereForScope } from '../common/rbac/scope.util';

export type ReportContext = {
  companyId: number;
  userId: number;
  roleKey: string;
};

export type ApplicationExportQuery = {
  jobId?: number;
  status?: string;
  stageId?: number;
  fromDate?: Date;
  toDate?: Date;
  format?: 'csv' | 'json';
};

export type PipelineExportQuery = {
  jobId?: number;
  fromDate?: Date;
  toDate?: Date;
  format?: 'csv' | 'json';
};

// ─── CSV helper ──────────────────────────────────────────────────────────────

function escapeCsv(val: unknown): string {
  const s = val == null ? '' : String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const header = headers.map(escapeCsv).join(',');
  const body = rows.map((r) => headers.map((h) => escapeCsv(r[h])).join(','));
  return [header, ...body].join('\n');
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Applications Export ──────────────────────────────────────────────────

  async exportApplications(ctx: ReportContext, query: ApplicationExportQuery) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      const jobWhere = isOrgWideScope(ctx.roleKey)
        ? { companyId: ctx.companyId }
        : jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);

      const scopedJobs = await tx.job.findMany({
        where: { ...jobWhere, ...(query.jobId ? { id: query.jobId } : {}) },
        select: { id: true },
      });
      const jobIds = scopedJobs.map((j) => j.id);

      if (jobIds.length === 0) return { rows: [], format: query.format ?? 'json' };

      const applications = await tx.application.findMany({
        where: {
          companyId: ctx.companyId,
          jobId: { in: jobIds },
          ...(query.status ? { status: query.status as any } : {}),
          ...(query.stageId ? { currentStageId: query.stageId } : {}),
          ...(query.fromDate || query.toDate
            ? {
                submittedAt: {
                  ...(query.fromDate ? { gte: query.fromDate } : {}),
                  ...(query.toDate ? { lte: query.toDate } : {}),
                },
              }
            : {}),
        },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          updatedAt: true,
          offerSentAt: true,
          offerAcceptedAt: true,
          candidateProfile: {
            select: { firstName: true, lastName: true, user: { select: { email: true } } },
          },
          job: { select: { title: true } },
          currentStage: { select: { name: true } },
          interviews: { select: { id: true } },
        },
        orderBy: { submittedAt: 'desc' },
      });

      const rows = applications.map((a) => ({
        applicationId: a.id,
        candidateName: `${a.candidateProfile.firstName} ${a.candidateProfile.lastName}`,
        email: a.candidateProfile.user.email,
        jobTitle: a.job.title,
        currentStage: a.currentStage?.name ?? '',
        status: a.status,
        submittedAt: a.submittedAt.toISOString(),
        updatedAt: a.updatedAt.toISOString(),
        interviewCount: a.interviews.length,
        offerSentAt: a.offerSentAt?.toISOString() ?? '',
        hiredAt: a.offerAcceptedAt?.toISOString() ?? '',
      }));

      return { rows, format: query.format ?? 'json' };
    });
  }

  applicationsToCsv(rows: Record<string, unknown>[]): string {
    const headers = [
      'applicationId',
      'candidateName',
      'email',
      'jobTitle',
      'currentStage',
      'status',
      'submittedAt',
      'updatedAt',
      'interviewCount',
      'offerSentAt',
      'hiredAt',
    ];
    return toCsv(headers, rows);
  }

  // ── Pipeline History Export ──────────────────────────────────────────────

  async exportPipelineHistory(ctx: ReportContext, query: PipelineExportQuery) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      const jobWhere = isOrgWideScope(ctx.roleKey)
        ? { companyId: ctx.companyId }
        : jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);

      const scopedJobs = await tx.job.findMany({
        where: { ...jobWhere, ...(query.jobId ? { id: query.jobId } : {}) },
        select: { id: true },
      });
      const jobIds = scopedJobs.map((j) => j.id);

      if (jobIds.length === 0) return { rows: [], format: query.format ?? 'json' };

      const histories = await tx.applicationHistory.findMany({
        where: {
          application: { companyId: ctx.companyId, jobId: { in: jobIds } },
          ...(query.fromDate || query.toDate
            ? {
                changedAt: {
                  ...(query.fromDate ? { gte: query.fromDate } : {}),
                  ...(query.toDate ? { lte: query.toDate } : {}),
                },
              }
            : {}),
        },
        select: {
          id: true,
          applicationId: true,
          changedAt: true,
          note: true,
          fromStage: { select: { name: true } },
          toStage: { select: { name: true } },
          changedBy: { select: { email: true } },
          application: {
            select: {
              candidateProfile: { select: { firstName: true, lastName: true } },
              job: { select: { title: true } },
            },
          },
        },
        orderBy: { changedAt: 'desc' },
      });

      const rows = histories.map((h) => ({
        historyId: h.id,
        applicationId: h.applicationId,
        candidateName: `${h.application.candidateProfile.firstName} ${h.application.candidateProfile.lastName}`,
        jobTitle: h.application.job.title,
        fromStage: h.fromStage?.name ?? '(start)',
        toStage: h.toStage?.name ?? '',
        changedBy: h.changedBy?.email ?? '',
        changedAt: h.changedAt.toISOString(),
        note: h.note ?? '',
      }));

      return { rows, format: query.format ?? 'json' };
    });
  }

  pipelineHistoryToCsv(rows: Record<string, unknown>[]): string {
    const headers = [
      'historyId',
      'applicationId',
      'candidateName',
      'jobTitle',
      'fromStage',
      'toStage',
      'changedBy',
      'changedAt',
      'note',
    ];
    return toCsv(headers, rows);
  }

  // ── Report catalogue ────────────────────────────────────────────────────

  async getReportsList(ctx: ReportContext) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      const rows = await tx.reportTemplate.findMany({
        where: { companyId: ctx.companyId },
        orderBy: { generatedAt: 'desc' },
      });

      const reports = rows.map((r) => ({
        id: String(r.id),
        title: r.title,
        description: r.description,
        tag: r.tag,
        exportType: r.exportType as 'applications' | 'pipeline',
        format: r.format as 'csv' | 'json',
        generatedAt: r.generatedAt.toISOString(),
      }));

      return { reports, total: reports.length };
    });
  }

  // ── Create template ──────────────────────────────────────────────────────

  async createTemplate(
    ctx: ReportContext,
    data: {
      title: string;
      description: string;
      exportType: string;
      format: string;
      tag?: string;
    },
  ) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      return tx.reportTemplate.create({
        data: {
          companyId: ctx.companyId,
          title: data.title,
          description: data.description,
          exportType: data.exportType,
          format: data.format,
          tag: data.tag ?? 'Live',
          generatedAt: new Date(),
        },
      });
    });
  }

  // ── Delete template ──────────────────────────────────────────────────────

  async deleteTemplate(ctx: ReportContext, templateId: number) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      const template = await tx.reportTemplate.findFirst({
        where: { id: templateId, companyId: ctx.companyId },
      });
      if (!template) return null;
      await tx.reportTemplate.delete({ where: { id: templateId } });
      return { id: templateId };
    });
  }

  // ── Touch (refresh generatedAt) ──────────────────────────────────────────

  async touchTemplate(ctx: ReportContext, templateId: number) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      const template = await tx.reportTemplate.findFirst({
        where: { id: templateId, companyId: ctx.companyId },
      });
      if (!template) return null;

      return tx.reportTemplate.update({
        where: { id: templateId },
        data: { generatedAt: new Date() },
        select: { id: true, generatedAt: true },
      });
    });
  }

  // ── Summary Analytics ────────────────────────────────────────────────────

  async getSummary(ctx: ReportContext) {
    return this.prisma.runWithOrgContext(ctx.companyId, async (tx) => {
      const jobWhere = isOrgWideScope(ctx.roleKey)
        ? { companyId: ctx.companyId }
        : jobWhereForScope(ctx.companyId, ctx.userId, ctx.roleKey);

      // Jobs in scope
      const scopedJobs = await tx.job.findMany({
        where: jobWhere,
        select: { id: true, title: true },
      });
      const jobIds = scopedJobs.map((j) => j.id);

      if (jobIds.length === 0) return this.emptySummary();

      // All applications in scope
      const applications = await tx.application.findMany({
        where: { companyId: ctx.companyId, jobId: { in: jobIds } },
        select: { status: true, jobId: true },
      });

      // Application history for time-in-stage calc
      const histories = await tx.applicationHistory.findMany({
        where: { application: { companyId: ctx.companyId, jobId: { in: jobIds } } },
        select: {
          applicationId: true,
          changedAt: true,
          fromStage: { select: { name: true } },
          toStage: { select: { name: true } },
        },
        orderBy: { changedAt: 'asc' },
      });

      // JobStats for top jobs
      const jobStats = await tx.jobStats.findMany({
        where: { jobId: { in: jobIds } },
        select: {
          jobId: true,
          applicantCount: true,
          shortlistedCount: true,
          interviewedCount: true,
          offeredCount: true,
          hiredCount: true,
          job: { select: { title: true } },
        },
        orderBy: { applicantCount: 'desc' },
        take: 10,
      });

      // ── Funnel ────────────────────────────────────────────────────────────
      const statusCount = (status: string) =>
        applications.filter((a) => a.status === status).length;

      const applied = applications.length;
      const screening = statusCount('SHORTLISTED');
      const interview = statusCount('INTERVIEW_SCHEDULED');
      const offer = statusCount('OFFERED');
      const hired = statusCount('HIRED');

      const funnel = { applied, screening, interview, offer, hired };

      // Drop-off percentages between stages
      const funnelPct = {
        appliedToScreening: applied > 0 ? pct(screening, applied) : 0,
        screeningToInterview: screening > 0 ? pct(interview, screening) : 0,
        interviewToOffer: interview > 0 ? pct(offer, interview) : 0,
        offerToHired: offer > 0 ? pct(hired, offer) : 0,
      };

      // ── Time-in-stage ─────────────────────────────────────────────────────
      // Group history by applicationId, then compute diff between consecutive entries
      const byApp = new Map<number, typeof histories>();
      for (const h of histories) {
        const arr = byApp.get(h.applicationId) ?? [];
        arr.push(h);
        byApp.set(h.applicationId, arr);
      }

      const stageDurations = new Map<string, number[]>(); // stageName → [ms durations]

      for (const [, rows] of byApp) {
        for (let i = 0; i < rows.length - 1; i++) {
          const stageName = rows[i].toStage?.name;
          if (!stageName) continue;
          const durationMs =
            rows[i + 1].changedAt.getTime() - rows[i].changedAt.getTime();
          if (durationMs > 0) {
            const arr = stageDurations.get(stageName) ?? [];
            arr.push(durationMs);
            stageDurations.set(stageName, arr);
          }
        }
      }

      const avgTimeInStage: Record<string, string> = {};
      for (const [stage, durations] of stageDurations) {
        const avgMs = durations.reduce((s, d) => s + d, 0) / durations.length;
        const days = (avgMs / (1000 * 60 * 60 * 24)).toFixed(1);
        avgTimeInStage[stage] = `${days} days`;
      }

      // ── Conversion rate ───────────────────────────────────────────────────
      const conversionRate = applied > 0 ? `${pct(hired, applied)}%` : '0%';

      // ── Top jobs ──────────────────────────────────────────────────────────
      const topJobs = jobStats.map((s) => ({
        jobId: s.jobId,
        jobTitle: s.job.title,
        applicants: s.applicantCount,
        shortlisted: s.shortlistedCount,
        interviewed: s.interviewedCount,
        offered: s.offeredCount,
        hired: s.hiredCount,
        conversionRate:
          s.applicantCount > 0 ? `${pct(s.hiredCount, s.applicantCount)}%` : '0%',
      }));

      return {
        funnel,
        funnelPct,
        avgTimeInStage,
        conversionRate,
        topJobs,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  private emptySummary() {
    return {
      funnel: { applied: 0, screening: 0, interview: 0, offer: 0, hired: 0 },
      funnelPct: {
        appliedToScreening: 0,
        screeningToInterview: 0,
        interviewToOffer: 0,
        offerToHired: 0,
      },
      avgTimeInStage: {},
      conversionRate: '0%',
      topJobs: [],
      generatedAt: new Date().toISOString(),
    };
  }
}

function pct(part: number, total: number): number {
  return Math.round((part / total) * 100);
}
