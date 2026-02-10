import { Prisma } from '@prisma/client';

export const candidateListSelect = {
  id: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  profilePicture: true,
  updatedAt: true,
  createdAt: true,
} satisfies Prisma.CandidateProfileSelect;

export const candidateGetOneSelect = {
  ...candidateListSelect,
  aboutMe: true,
  country: true,
  state: true,
  phone: true,
} satisfies Prisma.CandidateProfileSelect;

