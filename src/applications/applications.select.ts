import { Prisma } from '@prisma/client';

export const applicationListSelect = {
  id: true,
  jobId: true,
  candidateProfileId: true,
  companyId: true,
  status: true,
  submittedAt: true,
  updatedAt: true,
} satisfies Prisma.ApplicationSelect;
