import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ApplicationStatus, InterviewStatus, JobStatus } from '@prisma/client';

@Injectable()
export class CandidatePortalService {
  constructor(private readonly prisma: PrismaService) {}

  /** Find CandidateProfile.id for a given backend userId (no RLS on CandidateProfile) */
  private async getProfileId(userId: number): Promise<number | null> {
    const profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
    return profile?.id ?? null;
  }

  /** GET /candidate-portal/dashboard/metrics */
  async getMetrics(userId: number) {
    const profileId = await this.getProfileId(userId);

    if (!profileId) {
      return {
        applications: 0,
        shortlisted: 0,
        offers: 0,
        interviewInvites: 0,
        averageTimeToHire: null,
        trendIndicator: null,
      };
    }

    return this.prisma.runWithCandidateContext(profileId, async (tx) => {
      const [applications, shortlisted, offers, interviewInvites, hiredApps] =
        await Promise.all([
          tx.application.count({ where: { candidateProfileId: profileId } }),
          tx.application.count({
            where: {
              candidateProfileId: profileId,
              status: ApplicationStatus.SHORTLISTED,
            },
          }),
          tx.application.count({
            where: {
              candidateProfileId: profileId,
              status: { in: [ApplicationStatus.OFFERED, ApplicationStatus.HIRED] },
            },
          }),
          // Interview invites: upcoming scheduled/rescheduled interviews
          tx.interview.count({
            where: {
              application: { candidateProfileId: profileId },
              status: {
                in: [InterviewStatus.SCHEDULED, InterviewStatus.RESCHEDULED],
              },
            },
          }),
          tx.application.findMany({
            where: {
              candidateProfileId: profileId,
              status: ApplicationStatus.HIRED,
              hiredAt: { not: null },
            },
            select: { submittedAt: true, hiredAt: true },
          }),
        ]);

      let averageTimeToHire: number | null = null;
      if (hiredApps.length >= 1) {
        const total = hiredApps.reduce((sum, app) => {
          if (!app.hiredAt) return sum;
          const days = Math.floor(
            (app.hiredAt.getTime() - app.submittedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          );
          return sum + days;
        }, 0);
        averageTimeToHire = Math.round((total / hiredApps.length) * 10) / 10;
      }

      return {
        applications,
        shortlisted,
        offers,
        interviewInvites,
        averageTimeToHire,
        trendIndicator: null,
      };
    });
  }

  /** GET /candidate-portal/dashboard/applications */
  async getApplications(userId: number) {
    const profileId = await this.getProfileId(userId);
    if (!profileId) return [];

    return this.prisma.runWithCandidateContext(profileId, async (tx) => {
      const apps = await tx.application.findMany({
        where: { candidateProfileId: profileId },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              location: true,
              employmentType: true,
              company: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        take: 20,
      });

      return apps.map((app) => ({
        id: String(app.id),
        title: app.job.title,
        company: app.job.company.name,
        status: this.mapStatus(app.status),
        location: app.job.location ?? '',
        employmentType: app.job.employmentType,
        submittedAt: app.submittedAt.toISOString(),
        valuesMatch: 'Complete a MVM',
        avgCompetitors: 'N/A',
      }));
    });
  }

  /** GET /candidate-portal/dashboard/job-alerts */
  async getJobAlerts(userId: number) {
    const profileId = await this.getProfileId(userId);

    // Get already-applied job IDs (using candidate context if profile exists)
    const appliedJobIds: number[] = profileId
      ? await this.prisma.runWithCandidateContext(profileId, async (tx) => {
          const apps = await tx.application.findMany({
            where: { candidateProfileId: profileId },
            select: { jobId: true },
          });
          return apps.map((a) => a.jobId);
        })
      : [];

    // Use a temp context to enable Job_candidate_read policy
    const tempProfileId = profileId ?? 0;
    return this.prisma.runWithCandidateContext(tempProfileId, async (tx) => {
      const jobs = await tx.job.findMany({
        where: {
          status: JobStatus.LIVE,
          ...(appliedJobIds.length > 0 ? { id: { notIn: appliedJobIds } } : {}),
        },
        include: {
          company: { select: { id: true, name: true } },
        },
        orderBy: { publishedAt: 'desc' },
        take: 10,
      });

      return jobs.map((job) => ({
        id: String(job.id),
        title: job.title,
        company: job.company.name,
        location: job.location ?? 'Location not specified',
        type: job.employmentType,
        salary:
          job.minSalary && job.maxSalary
            ? `€ ${job.minSalary.toLocaleString()}–${job.maxSalary.toLocaleString()} / month`
            : job.salary ?? 'Not specified',
      }));
    });
  }

  /** GET /candidate-portal/dashboard/interviews/upcoming */
  async getUpcomingInterviews(userId: number) {
    const profileId = await this.getProfileId(userId);
    if (!profileId) return [];

    return this.prisma.runWithCandidateContext(profileId, async (tx) => {
      const now = new Date();
      const nextMonth = new Date(now);
      nextMonth.setDate(nextMonth.getDate() + 30);

      const interviews = await tx.interview.findMany({
        where: {
          application: { candidateProfileId: profileId },
          scheduledAt: { gte: now, lte: nextMonth },
          status: { notIn: [InterviewStatus.CANCELED] },
        },
        include: {
          application: {
            include: {
              job: {
                select: {
                  title: true,
                  company: { select: { name: true } },
                },
              },
            },
          },
          scheduledBy: { select: { email: true } },
        },
        orderBy: { scheduledAt: 'asc' },
        take: 10,
      });

      const todayMidnight = new Date();
      todayMidnight.setHours(0, 0, 0, 0);
      const tomorrowMidnight = new Date(todayMidnight);
      tomorrowMidnight.setDate(tomorrowMidnight.getDate() + 1);

      return interviews.map((iv) => {
        const date = iv.scheduledAt;
        const dateMidnight = new Date(date);
        dateMidnight.setHours(0, 0, 0, 0);

        let timeLabel: string;
        const timeStr = date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true,
        });

        if (dateMidnight.getTime() === todayMidnight.getTime()) {
          timeLabel = `Today, ${timeStr}`;
        } else if (dateMidnight.getTime() === tomorrowMidnight.getTime()) {
          timeLabel = `Tomorrow, ${timeStr}`;
        } else {
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          timeLabel = `${dayName}, ${timeStr}`;
        }

        return {
          id: String(iv.id),
          time: timeLabel,
          name: iv.application.job.company.name,
          role: iv.application.job.title,
          type: (iv.type === 'VIDEO' ? 'video' : 'onsite') as 'video' | 'onsite',
          date: iv.scheduledAt.toISOString(),
          eventId: String(iv.id),
        };
      });
    });
  }

  /** GET /candidate-portal/jobs – public list of LIVE jobs */
  async getJobListings() {
    return this.prisma.runWithCandidateContext(0, async (tx) => {
      const jobs = await tx.job.findMany({
        where: { status: JobStatus.LIVE },
        include: { company: { select: { id: true, name: true } } },
        orderBy: { publishedAt: 'desc' },
      });

      return jobs.map((job) => this.mapJobToResponse(job));
    });
  }

  /** GET /candidate-portal/jobs/:id – single LIVE job */
  async getJobById(jobId: number) {
    const job = await this.prisma.runWithCandidateContext(0, async (tx) => {
      return tx.job.findFirst({
        where: { id: jobId, status: JobStatus.LIVE },
        include: { company: { select: { id: true, name: true } } },
      });
    });

    if (!job) throw new NotFoundException('Job not found');
    return this.mapJobToResponse(job);
  }

  /** POST /candidate-portal/jobs/:id/apply */
  async applyToJob(userId: number, jobId: number) {
    const profileId = await this.getProfileId(userId);
    if (!profileId) throw new NotFoundException('Candidate profile not found');

    const job = await this.prisma.job.findFirst({
      where: { id: jobId, status: JobStatus.LIVE },
      select: { id: true, companyId: true },
    });
    if (!job) throw new NotFoundException('Job not found');

    return this.prisma.runWithCandidateContext(profileId, async (tx) => {
      const existing = await tx.application.findFirst({
        where: { candidateProfileId: profileId, jobId },
        select: { id: true, status: true },
      });
      if (existing) {
        throw new ConflictException('Already applied to this job');
      }

      const application = await tx.application.create({
        data: {
          candidateProfileId: profileId,
          jobId,
          companyId: job.companyId,
          status: ApplicationStatus.SUBMITTED,
          submittedAt: new Date(),
        },
        select: { id: true, status: true },
      });

      return { id: String(application.id), status: application.status };
    });
  }

  /** GET /candidate-portal/me – current candidate user */
  async getCurrentUser(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        type: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            jobTitle: true,
            phone: true,
            profilePicture: true,
            preferredLanguage: true,
          },
        },
        candidateProfile: {
          select: {
            firstName: true,
            lastName: true,
            jobTitle: true,
            phone: true,
            profilePicture: true,
          },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    // Prefer CandidateProfile for candidates, fallback to Profile
    const cp = user.candidateProfile;
    const prof = user.profile;
    const name =
      (cp
        ? [cp.firstName, cp.lastName].filter(Boolean).join(' ')
        : prof
          ? [prof.firstName, prof.lastName].filter(Boolean).join(' ')
          : null) || user.email;

    const image = cp?.profilePicture ?? prof?.profilePicture ?? null;
    const languagePreference = prof?.preferredLanguage ?? null;
    const jobTitle = cp?.jobTitle ?? prof?.jobTitle ?? null;
    const phoneNumber = cp?.phone ?? prof?.phone ?? null;

    return {
      id: String(user.id),
      name,
      email: user.email,
      role: user.type,
      image,
      languagePreference,
      jobTitle,
      phoneNumber,
    };
  }

  /** PATCH /candidate-portal/me/language – update preferred language */
  async updateLanguagePreference(userId: number, language: string) {
    await this.prisma.profile.updateMany({
      where: { userId },
      data: { preferredLanguage: language },
    });
    return { languagePreference: language };
  }

  /** GET /candidate-portal/me/quick-actions – user + MVM status */
  async getQuickActionsData(userId: number) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        type: true,
        profile: { select: { firstName: true, lastName: true } },
      },
    });
    if (!user) throw new NotFoundException('User not found');

    const name =
      [user.profile?.firstName, user.profile?.lastName]
        .filter(Boolean)
        .join(' ') || user.email;

    return {
      user: {
        id: String(user.id),
        name,
        email: user.email,
        role: user.type,
      },
      mvm: null as null,
    };
  }

  private mapJobToResponse(job: {
    id: number;
    title: string;
    location: string | null;
    salary: string | null;
    minSalary: number | null;
    maxSalary: number | null;
    publishedAt: Date | null;
    employmentType: string;
    workArrangement: string;
    introduction: string | null;
    responsibilities: string | null;
    education: string | null;
    requirements: string | null;
    perks: string | null;
    company: { id: number; name: string };
  }) {
    const salary =
      job.minSalary && job.maxSalary
        ? `€ ${job.minSalary.toLocaleString()}–${job.maxSalary.toLocaleString()} / month`
        : (job.salary ?? null);

    return {
      id: String(job.id),
      jobTitle: job.title,
      organization: { name: job.company.name },
      location: job.location,
      salary,
      postedAt: job.publishedAt,
      employmentType: job.employmentType,
      workArrangement: job.workArrangement,
      introduction: job.introduction,
      responsibilities: job.responsibilities,
      education: job.education,
      requirements: job.requirements,
      perks: job.perks,
    };
  }

  private mapStatus(status: ApplicationStatus): string {
    const map: Record<ApplicationStatus, string> = {
      SUBMITTED: 'Submitted',
      SHORTLISTED: 'Shortlisted',
      INTERVIEW_SCHEDULED: 'Interview Scheduled',
      INTERVIEWED: 'Interviewed',
      OFFERED: 'Offer Received',
      REJECTED: 'Rejected',
      WITHDRAWN: 'Withdrawn',
      HIRED: 'Hired',
    };
    return map[status] ?? status;
  }
}
