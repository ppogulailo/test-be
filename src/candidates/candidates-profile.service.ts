import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JobType, Visibility } from '@prisma/client';

export type UpdateProfileDto = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null; // maps to firstName + lastName if both missing
  phone?: string | null;
  phoneNumber?: string | null; // maps to phone
  country?: string | null;
  state?: string | null;
  location?: string | null; // maps to country when state not provided
  jobTitle?: string | null;
  aboutMe?: string | null;
  professionalSummary?: string | null; // maps to aboutMe
  image?: string | null; // maps to profilePicture
  // Job preference
  preferredRoles?: string[] | string | null;
  desiredLocations?: string[] | string | null;
  desiredLocation?: string | null; // maps to desiredLocations
  availability?: string | null;
  salaryExpectation?: number | null;
  salaryExpectations?: string | number | null; // maps to salaryExpectation
  jobType?: JobType | string | null;
  visibility?: Visibility | string | null;
  // Profile links
  linkedinUrl?: string | null;
  behanceUrl?: string | null;
  githubUrl?: string | null;
  personalWebsiteUrl?: string | null;
  // Visibility preference
  showProfileToRecruiters?: boolean | null;
  hideContactDetails?: boolean | null;
  showJobPreferences?: boolean | null;
  dataDownloadConsent?: boolean | null;
};

export type ProfileCompletionBreakdown = {
  percentage: number;
  requiredFieldsScore: number;
  optionalFieldsScore: number;
  documentsScore: number;
  missingRequiredFields: string[];
  missingOptionalFields: string[];
  hasCV: boolean;
  hasCoverLetter: boolean;
};

export type ExtendedUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  languagePreference: string | null;
  jobTitle: string | null;
  phoneNumber: string | null;
  firstName: string | null;
  lastName: string | null;
  location: string | null;
  professionalSummary: string | null;
  profileCompletionPercentage: number;
  preferredRoles: string | null;
  desiredLocation: string | null;
  availability: string | null;
  salaryExpectations: string | null;
  jobType: string | null;
  linkedinUrl: string | null;
  behanceUrl: string | null;
  githubUrl: string | null;
  personalWebsiteUrl: string | null;
};

export type ProfileUpdateResult = {
  user: ExtendedUser;
  completion: ProfileCompletionBreakdown;
};

export type ProfilePageData = {
  user: ExtendedUser;
  completion: ProfileCompletionBreakdown;
  cvFiles: Array<{ id: string; filename: string; sizeBytes: number; createdAt: string; url: string }>;
  coverLetterFiles: Array<{ id: string; filename: string; sizeBytes: number; createdAt: string; url?: string }>;
  defaultCvFileId: string | null;
  defaultCoverLetterFileId: string | null;
};

@Injectable()
export class CandidatesProfileService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreateProfile(userId: number) {
    let profile = await this.prisma.candidateProfile.findUnique({
      where: { userId },
      include: {
        contactInfo: true,
        jobPreference: true,
        profileLinks: true,
        notificationPreference: true,
        profileVisibilityPreference: true,
        resumes: true,
        coverLetters: true,
        user: { select: { email: true } },
      },
    });

    if (!profile) {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, profile: { select: { firstName: true, lastName: true } } },
      });
      if (!user) throw new NotFoundException('User not found');

      profile = await this.prisma.candidateProfile.create({
        data: {
          userId,
          firstName: user.profile?.firstName ?? 'Candidate',
          lastName: user.profile?.lastName ?? 'User',
          profileVisibilityPreference: {
            create: {},
          },
        },
        include: {
          contactInfo: true,
          jobPreference: true,
          profileLinks: true,
          notificationPreference: true,
          profileVisibilityPreference: true,
          resumes: true,
          coverLetters: true,
          user: { select: { email: true } },
        },
      });
    }

    return profile;
  }

  private computeCompletion(profile: {
    firstName: string;
    lastName: string;
    jobTitle: string | null;
    aboutMe: string | null;
    phone: string | null;
    country: string | null;
    state: string | null;
    profilePicture: string | null;
    resumes: { id: number }[];
    coverLetters: { id: number }[];
    jobPreference: { preferredRoles: string[]; salaryExpectation: number | null } | null;
  }): ProfileCompletionBreakdown {
    const required = [
      !!profile.firstName?.trim(),
      !!profile.lastName?.trim(),
      !!profile.jobTitle?.trim(),
      !!profile.aboutMe?.trim(),
    ];
    const optional = [
      !!profile.phone?.trim(),
      !!profile.country?.trim() || !!profile.state?.trim(),
      !!profile.profilePicture?.trim(),
      !!profile.jobPreference?.preferredRoles?.length,
      profile.jobPreference?.salaryExpectation != null,
    ];
    const hasCV = profile.resumes.length > 0;
    const hasCoverLetter = profile.coverLetters.length > 0;
    const documentsScore = (hasCV ? 50 : 0) + (hasCoverLetter ? 50 : 0);

    const requiredFieldsScore = required.filter(Boolean).length / required.length;
    const optionalFieldsScore = optional.filter(Boolean).length / Math.max(optional.length, 1);
    const documentsScoreNorm = documentsScore / 100;

    const percentage = Math.round(
      (requiredFieldsScore * 0.5 + optionalFieldsScore * 0.25 + documentsScoreNorm * 0.25) * 100,
    );

    const missingRequired: string[] = [];
    if (!profile.firstName?.trim()) missingRequired.push('firstName');
    if (!profile.lastName?.trim()) missingRequired.push('lastName');
    if (!profile.jobTitle?.trim()) missingRequired.push('jobTitle');
    if (!profile.aboutMe?.trim()) missingRequired.push('aboutMe');

    const missingOptional: string[] = [];
    if (!profile.phone?.trim()) missingOptional.push('phone');
    if (!profile.country?.trim() && !profile.state?.trim()) missingOptional.push('location');
    if (!profile.profilePicture?.trim()) missingOptional.push('profilePhoto');
    if (!profile.jobPreference?.preferredRoles?.length) missingOptional.push('preferredRoles');
    if (profile.jobPreference?.salaryExpectation == null) missingOptional.push('salaryExpectation');

    return {
      percentage,
      requiredFieldsScore: Math.round(requiredFieldsScore * 100),
      optionalFieldsScore: Math.round(optionalFieldsScore * 100),
      documentsScore,
      missingRequiredFields: missingRequired,
      missingOptionalFields: missingOptional,
      hasCV,
      hasCoverLetter,
    };
  }

  private toExtendedUser(
    profile: {
      id: number;
      firstName: string;
      lastName: string;
      phone: string | null;
      country: string | null;
      state: string | null;
      jobTitle: string | null;
      profilePicture: string | null;
      aboutMe: string | null;
      user: { email: string };
      jobPreference: {
        preferredRoles: string[];
        desiredLocations: string[];
        availability: string | null;
        salaryExpectation: number | null;
        jobType: string | null;
      } | null;
      profileLinks: {
        github: string | null;
        behance: string | null;
        personalSite: string | null;
        other: string | null;
      } | null;
      contactInfo: { linkedin: string | null } | null;
    },
    completion: ProfileCompletionBreakdown,
  ): ExtendedUser {
    const location = [profile.country, profile.state].filter(Boolean).join(', ') || null;
    return {
      id: String(profile.id),
      name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.user.email,
      email: profile.user.email,
      image: profile.profilePicture,
      languagePreference: null,
      jobTitle: profile.jobTitle,
      phoneNumber: profile.phone,
      firstName: profile.firstName,
      lastName: profile.lastName,
      location,
      professionalSummary: profile.aboutMe,
      profileCompletionPercentage: completion.percentage,
      preferredRoles: profile.jobPreference?.preferredRoles?.join(', ') ?? null,
      desiredLocation: profile.jobPreference?.desiredLocations?.join(', ') ?? null,
      availability: profile.jobPreference?.availability ?? null,
      salaryExpectations: profile.jobPreference?.salaryExpectation != null
        ? String(profile.jobPreference.salaryExpectation)
        : null,
      jobType: profile.jobPreference?.jobType ?? null,
      linkedinUrl: profile.contactInfo?.linkedin ?? null,
      behanceUrl: profile.profileLinks?.behance ?? null,
      githubUrl: profile.profileLinks?.github ?? null,
      personalWebsiteUrl: profile.profileLinks?.personalSite ?? profile.profileLinks?.other ?? null,
    };
  }

  async getProfileWithCompletion(userId: number): Promise<ProfileUpdateResult> {
    const profile = await this.getOrCreateProfile(userId);
    const completion = this.computeCompletion(profile);
    const user = this.toExtendedUser(profile, completion);
    return { user, completion };
  }

  async getProfilePageData(userId: number): Promise<ProfilePageData> {
    const { user, completion } = await this.getProfileWithCompletion(userId);
    const profile = await this.getOrCreateProfile(userId);

    const cvFiles = profile.resumes.map((r) => ({
      id: String(r.id),
      filename: r.title ?? `resume-${r.id}`,
      sizeBytes: 0,
      createdAt: r.uploadedAt.toISOString(),
      url: r.url,
    }));

    const coverLetterFiles = profile.coverLetters.map((c) => ({
      id: String(c.id),
      filename: c.title ?? `cover-letter-${c.id}`,
      sizeBytes: 0,
      createdAt: c.uploadedAt.toISOString(),
      url: c.url ?? undefined,
    }));

    const defaultCv = profile.resumes.find((r) => r.useForApplication);
    const defaultCover = profile.coverLetters.find((c) => c.useForApplication);

    return {
      user,
      completion,
      cvFiles,
      coverLetterFiles,
      defaultCvFileId: defaultCv ? String(defaultCv.id) : null,
      defaultCoverLetterFileId: defaultCover ? String(defaultCover.id) : null,
    };
  }

  async updateProfile(userId: number, dto: UpdateProfileDto): Promise<ProfileUpdateResult> {
    const profile = await this.getOrCreateProfile(userId);

    const arr = (v: string[] | string | null | undefined): string[] => {
      if (v == null) return [];
      return Array.isArray(v) ? v : String(v).split(',').map((s) => s.trim()).filter(Boolean);
    };
    const aboutMe = dto.aboutMe ?? dto.professionalSummary ?? profile.aboutMe;
    const phone = dto.phone ?? dto.phoneNumber ?? profile.phone;
    const location = dto.location ?? null;
    const country = dto.country ?? (location && !dto.state ? location : profile.country);
    const state = dto.state ?? profile.state;
    const profilePicture = dto.image ?? profile.profilePicture;
    const firstName = dto.firstName ?? (dto.name ? dto.name.split(' ')[0] ?? profile.firstName : profile.firstName);
    const lastName = dto.lastName ?? (dto.name ? dto.name.split(' ').slice(1).join(' ') || profile.lastName : profile.lastName);

    const desiredLocs: string[] | null =
      dto.desiredLocations != null
        ? Array.isArray(dto.desiredLocations)
          ? dto.desiredLocations
          : arr(dto.desiredLocations)
        : dto.desiredLocation
          ? arr(dto.desiredLocation)
          : null;
    const salaryExp =
      dto.salaryExpectation ??
      (dto.salaryExpectations != null ? (typeof dto.salaryExpectations === 'string' ? parseInt(dto.salaryExpectations, 10) : dto.salaryExpectations) : null);

    await this.prisma.$transaction(async (tx) => {
      await tx.candidateProfile.update({
        where: { id: profile.id },
        data: {
          firstName,
          lastName,
          phone,
          country,
          state,
          jobTitle: dto.jobTitle ?? profile.jobTitle,
          aboutMe,
          profilePicture,
        },
      });

      if (
        dto.preferredRoles != null ||
        dto.desiredLocations != null ||
        dto.availability != null ||
        dto.salaryExpectation != null ||
        dto.jobType != null ||
        dto.visibility != null
      ) {
        const jobType =
          dto.jobType != null && typeof dto.jobType === 'string' && dto.jobType in JobType
            ? (dto.jobType as JobType)
            : profile.jobPreference?.jobType;
        const visibility =
          dto.visibility != null && typeof dto.visibility === 'string' && dto.visibility in Visibility
            ? (dto.visibility as Visibility)
            : profile.jobPreference?.visibility;

        await tx.jobPreference.upsert({
          where: { candidateProfileId: profile.id },
          create: {
            candidateProfileId: profile.id,
            preferredRoles: arr(dto.preferredRoles ?? profile.jobPreference?.preferredRoles),
            desiredLocations: desiredLocs ?? profile.jobPreference?.desiredLocations ?? [],
            tags: [],
            availability: dto.availability ?? profile.jobPreference?.availability ?? null,
            salaryExpectation: salaryExp ?? profile.jobPreference?.salaryExpectation ?? null,
            jobType,
            visibility: visibility ?? Visibility.VISIBLE_TO_MATCHED_RECRUITER,
          },
          update: {
            preferredRoles: dto.preferredRoles != null ? arr(dto.preferredRoles) : undefined,
            desiredLocations: desiredLocs ?? undefined,
            availability: dto.availability ?? undefined,
            salaryExpectation: salaryExp ?? undefined,
            jobType: dto.jobType != null ? (dto.jobType as JobType) : undefined,
            visibility: dto.visibility != null ? (dto.visibility as Visibility) : undefined,
          },
        });
      }

      if (
        dto.linkedinUrl != null ||
        dto.behanceUrl != null ||
        dto.githubUrl != null ||
        dto.personalWebsiteUrl != null
      ) {
        if (profile.contactInfoId) {
          await tx.contactInfo.update({
            where: { id: profile.contactInfoId },
            data: { linkedin: dto.linkedinUrl ?? undefined },
          });
        } else if (dto.linkedinUrl) {
          const contact = await tx.contactInfo.create({
            data: {
              email: profile.user.email,
              linkedin: dto.linkedinUrl,
            },
          });
          await tx.candidateProfile.update({
            where: { id: profile.id },
            data: { contactInfoId: contact.id },
          });
        }

        await tx.profileLinks.upsert({
          where: { candidateProfileId: profile.id },
          create: {
            candidateProfileId: profile.id,
            behance: dto.behanceUrl ?? null,
            github: dto.githubUrl ?? null,
            personalSite: dto.personalWebsiteUrl ?? null,
          },
          update: {
            behance: dto.behanceUrl ?? undefined,
            github: dto.githubUrl ?? undefined,
            personalSite: dto.personalWebsiteUrl ?? undefined,
          },
        });
      }

      if (
        dto.showProfileToRecruiters != null ||
        dto.hideContactDetails != null ||
        dto.showJobPreferences != null ||
        dto.dataDownloadConsent != null
      ) {
        await tx.profileVisibilityPreference.upsert({
          where: { candidateProfileId: profile.id },
          create: {
            candidateProfileId: profile.id,
            showProfileToRecruiters: dto.showProfileToRecruiters ?? false,
            hideContactDetails: dto.hideContactDetails ?? false,
            showJobPreferences: dto.showJobPreferences ?? false,
            dataDownloadConsent: dto.dataDownloadConsent ?? false,
          },
          update: {
            showProfileToRecruiters: dto.showProfileToRecruiters ?? undefined,
            hideContactDetails: dto.hideContactDetails ?? undefined,
            showJobPreferences: dto.showJobPreferences ?? undefined,
            dataDownloadConsent: dto.dataDownloadConsent ?? undefined,
          },
        });
      }
    });

    return this.getProfileWithCompletion(userId);
  }

  async setResumeForApplication(userId: number, resumeId: number): Promise<void> {
    const profile = await this.getOrCreateProfile(userId);
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, candidateProfileId: profile.id },
    });
    if (!resume) throw new NotFoundException('Resume not found');

    await this.prisma.$transaction([
      this.prisma.resume.updateMany({
        where: { candidateProfileId: profile.id },
        data: { useForApplication: false },
      }),
      this.prisma.resume.update({
        where: { id: resumeId },
        data: { useForApplication: true },
      }),
    ]);
  }

  async addResume(userId: number, url: string, title?: string): Promise<{ id: number; url: string }> {
    const profile = await this.getOrCreateProfile(userId);
    const resume = await this.prisma.resume.create({
      data: {
        url,
        title: title ?? `Resume ${Date.now()}`,
        candidateProfileId: profile.id,
        useForApplication: profile.resumes.length === 0,
      },
    });
    return { id: resume.id, url: resume.url };
  }

  async addCoverLetter(userId: number, url: string, title?: string): Promise<{ id: number; url: string }> {
    const profile = await this.getOrCreateProfile(userId);
    const cover = await this.prisma.coverLetter.create({
      data: {
        url,
        title: title ?? `Cover Letter ${Date.now()}`,
        candidateProfileId: profile.id,
        useForApplication: profile.coverLetters.length === 0,
      },
    });
    return { id: cover.id, url: cover.url ?? url };
  }

  async deleteResume(userId: number, resumeId: number): Promise<void> {
    const profile = await this.getOrCreateProfile(userId);
    const resume = await this.prisma.resume.findFirst({
      where: { id: resumeId, candidateProfileId: profile.id },
    });
    if (!resume) throw new NotFoundException('Resume not found');
    await this.prisma.resume.delete({ where: { id: resumeId } });
  }

  async deleteCoverLetter(userId: number, coverLetterId: number): Promise<void> {
    const profile = await this.getOrCreateProfile(userId);
    const cover = await this.prisma.coverLetter.findFirst({
      where: { id: coverLetterId, candidateProfileId: profile.id },
    });
    if (!cover) throw new NotFoundException('Cover letter not found');
    await this.prisma.coverLetter.delete({ where: { id: coverLetterId } });
  }

  async setProfilePhoto(userId: number, url: string): Promise<{ url: string }> {
    const profile = await this.getOrCreateProfile(userId);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profilePicture: url },
    });
    return { url };
  }

  async deleteProfilePhoto(userId: number): Promise<void> {
    const profile = await this.getOrCreateProfile(userId);
    await this.prisma.candidateProfile.update({
      where: { id: profile.id },
      data: { profilePicture: null },
    });
  }

  async setCoverLetterForApplication(userId: number, coverLetterId: number): Promise<void> {
    const profile = await this.getOrCreateProfile(userId);
    const cover = await this.prisma.coverLetter.findFirst({
      where: { id: coverLetterId, candidateProfileId: profile.id },
    });
    if (!cover) throw new NotFoundException('Cover letter not found');

    await this.prisma.$transaction([
      this.prisma.coverLetter.updateMany({
        where: { candidateProfileId: profile.id },
        data: { useForApplication: false },
      }),
      this.prisma.coverLetter.update({
        where: { id: coverLetterId },
        data: { useForApplication: true },
      }),
    ]);
  }
}
