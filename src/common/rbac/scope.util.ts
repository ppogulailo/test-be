import type { Job, Prisma } from '@prisma/client';

/**
 * Roles that see org-wide data (all jobs/applications in the org).
 * Recruiter sees only own (recruiterId = self) or assigned (JobAssignment) jobs.
 */
const ORG_WIDE_ROLE_KEYS = new Set(['admin', 'hm', 'viewer']);

export function isOrgWideScope(roleKey: string): boolean {
  return ORG_WIDE_ROLE_KEYS.has(roleKey.toLowerCase());
}

/**
 * Build Prisma where clause for Job list/get so that:
 * - Admin, HM, Viewer, Reviewer: org-wide (companyId only).
 * - Recruiter: own jobs (recruiterId = userId) or assigned (JobAssignment.recruiterId = userId, isActive).
 */
export function jobWhereForScope(
  companyId: number,
  userId: number,
  roleKey: string,
): Prisma.JobWhereInput {
  const base = { companyId };
  if (isOrgWideScope(roleKey)) {
    return base;
  }
  return {
    ...base,
    OR: [
      { recruiterId: userId },
      {
        jobAssignments: {
          some: {
            recruiterId: userId,
            isActive: true,
          },
        },
      },
    ],
  };
}

/**
 * Recruiter can access a job only if they own it or are assigned. Admin/HM/Viewer can access any job in the org.
 * Pass hasAssignment: true when the recruiter has an active JobAssignment for this job.
 */
export function canAccessJob(
  job: { companyId: number; recruiterId: number | null },
  companyId: number,
  userId: number,
  roleKey: string,
  hasAssignment?: boolean,
): boolean {
  if (job.companyId !== companyId) return false;
  if (isOrgWideScope(roleKey)) return true;
  if (job.recruiterId === userId) return true;
  if (hasAssignment) return true;
  return false;
}
