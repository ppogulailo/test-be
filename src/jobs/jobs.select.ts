// jobs.select.ts
import { Prisma } from '@prisma/client';

export const jobListSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobSelect;

export const jobGetOneSelect = {
  id: true,
  title: true,
  status: true,
  companyId: true,
  recruiterId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.JobSelect;

export const jobPublishReadSelect = {
  id: true,
  companyId: true,
  recruiterId: true,
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
