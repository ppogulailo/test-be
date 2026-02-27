// jobs.select.ts
import { Prisma } from '@prisma/client';

export const jobListSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  departmentId: true,
  createdAt: true,
  updatedAt: true,
  recruiter: {
    select: {
      id: true,
      profile: { select: { firstName: true, lastName: true } },
    },
  },
} satisfies Prisma.JobSelect;

export const jobGetOneSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  recruiterId: true,
  createdAt: true,
  updatedAt: true,
  // Role overview scalar fields
  departmentId: true,
  location: true,
  employmentType: true,
  workArrangement: true,
  salary: true,
  hoursPerWeek: true,
  companySize: true,
  language: true,
  jobNumber: true,
  applicationClosingDate: true,
  experience: true,
  // Narrative fields
  introduction: true,
  responsibilities: true,
  requirements: true,
  perks: true,
  education: true,
  // Recruiter relation (Job.recruiter → User → Profile)
  recruiter: {
    select: {
      profile: { select: { firstName: true, lastName: true } },
    },
  },
  // Core value keywords (one row per keyword per dimension)
  JobCoreValueKeyword: {
    select: {
      coreValue: { select: { name: true } },
      keyword: true,
    },
  },
  // Core value weightings (one row per dimension)
  JobCoreValueWeighting: {
    select: {
      coreValue: { select: { name: true } },
      weight: true,
    },
  },
  // Benchmark profile with nested fit-priority, core values, team-style tags
  JobBenchmarkProfile: {
    select: {
      jobPostRole: true,
      benchmarkRole: true,
      fitPriority: {
        select: {
          hiringFocus: true,
          devStrategy: true,
          longTerm: true,
        },
      },
      coreValues: {
        select: {
          coreValue: { select: { name: true } },
          weight: true,
        },
      },
      teamStyleTags: {
        select: { tag: true },
      },
    },
  },
} satisfies Prisma.JobSelect;

export const jobPublishReadSelect = {
  id: true,
  companyId: true,
  recruiterId: true,
  status: true,
  title: true,
  experience: true,
  employmentType: true,
  workArrangement: true,
  location: true,
  introduction: true,
  responsibilities: true,
  requirements: true,
  salary: true,
} satisfies Prisma.JobSelect;

export const jobPublishResultSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  updatedAt: true,
} satisfies Prisma.JobSelect;

export type JobPublicDto = Prisma.JobGetPayload<{
  select: typeof jobPublishResultSelect;
}>;
