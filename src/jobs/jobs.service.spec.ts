import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JobStatus } from '@prisma/client';
import { JobsService } from './jobs.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  EmploymentType,
  ExperienceLevel,
  RequirementsLevel,
  WorkArrangement,
} from '@prisma/client';

describe('JobsService', () => {
  let service: JobsService;

  const mockRunWithOrgContext = jest.fn();
  const mockJobFindFirst = jest.fn();
  const mockJobFindMany = jest.fn();
  const mockJobAssignmentFindFirst = jest.fn();

  const ctx = {
    companyId: 1,
    userId: 10,
    roleKey: 'admin',
  };
  const createDto = {
    title: 'Test',
    experience: ExperienceLevel.MID,
    employmentType: EmploymentType.LONG_TERM,
    workArrangement: WorkArrangement.REMOTE,
  responsibilities: 'Build and deliver features',
  requirements: RequirementsLevel.INTERMEDIATE,
  perks: 'Flexible hours',
  location: 'Berlin',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JobsService,
        {
          provide: PrismaService,
          useValue: {
            runWithOrgContext: mockRunWithOrgContext,
            job: {
              findFirst: mockJobFindFirst,
              findMany: mockJobFindMany,
            },
            jobAssignment: {
              findFirst: mockJobAssignmentFindFirst,
            },
          },
        },
      ],
    }).compile();

    service = module.get<JobsService>(JobsService);
    mockRunWithOrgContext.mockImplementation(
      (_orgId: number, fn: (tx: unknown) => Promise<unknown>) => fn({}),
    );
    mockJobFindFirst.mockReset();
    mockJobFindMany.mockReset();
    mockJobAssignmentFindFirst.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('calls runWithOrgContext and returns jobs from transaction', async () => {
      const jobs = [
        {
          id: 1,
          title: 'J1',
          status: JobStatus.DRAFT,
          companyId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({ job: { findMany: () => Promise.resolve(jobs) } }),
          ),
      );

      const result = await service.list(ctx);

      expect(mockRunWithOrgContext).toHaveBeenCalledWith(
        1,
        expect.any(Function),
      );
      expect(result).toEqual([
        {
          ...jobs[0],
          assignedRecruiter: null,
        },
      ]);
    });
  });

  describe('getOne', () => {
    it('throws NotFoundException when job not found', async () => {
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({ job: { findFirst: () => Promise.resolve(null) } }),
          ),
      );

      await expect(service.getOne(999, ctx)).rejects.toThrow(NotFoundException);
      await expect(service.getOne(999, ctx)).rejects.toThrow('Job not found');
    });

    it('returns job without recruiterId for org-wide role', async () => {
      const job = {
        id: 1,
        title: 'J1',
        status: JobStatus.DRAFT,
        companyId: 1,
        recruiterId: 5,
        recruiter: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        departmentId: null,
        location: null,
        employmentType: EmploymentType.LONG_TERM,
        workArrangement: WorkArrangement.REMOTE,
        salary: null,
        hoursPerWeek: null,
        companySize: null,
        language: null,
        jobNumber: null,
        applicationClosingDate: null,
        experience: ExperienceLevel.MID,
        introduction: null,
        responsibilities: null,
        requirements: null,
        perks: null,
        education: null,
        JobCoreValueKeyword: [],
        JobCoreValueWeighting: [],
        JobBenchmarkProfile: [],
      };
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({ job: { findFirst: () => Promise.resolve(job) } }),
          ),
      );

      const result = await service.getOne(1, ctx);

      expect(result).not.toHaveProperty('recruiterId');
      expect(result.id).toBe(1);
      expect(result.companyId).toBe(1);
    });

    it('throws ForbiddenException when recruiter and not own/assigned', async () => {
      const recruiterCtx = { ...ctx, roleKey: 'recruiter' };
      const job = {
        id: 1,
        title: 'J1',
        status: JobStatus.DRAFT,
        companyId: 1,
        recruiterId: 99,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({ job: { findFirst: () => Promise.resolve(job) } }),
          ),
      );
      mockJobAssignmentFindFirst.mockResolvedValue(null);

      await expect(service.getOne(1, recruiterCtx)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getOne(1, recruiterCtx)).rejects.toThrow(
        'Access denied: you do not own or are not assigned to this job',
      );
    });
  });

  describe('create', () => {
    it('calls runWithOrgContext with create data and returns job', async () => {
      const created = {
        id: 1,
        title: 'Test',
        status: JobStatus.DRAFT,
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({
              job: {
                create: () => Promise.resolve(created),
              },
            }),
          ),
      );

      const result = await service.create(ctx, createDto);

      expect(result).toEqual(created);
      expect(mockRunWithOrgContext).toHaveBeenCalledWith(
        1,
        expect.any(Function),
      );
    });
  });

  describe('publish', () => {
    it('throws NotFoundException when job not found', async () => {
      mockJobFindFirst.mockResolvedValue(null);

      await expect(service.publish(999, ctx, false)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.publish(999, ctx, false)).rejects.toThrow(
        'Job not found',
      );
    });

    it('throws BadRequestException when status transition is not allowed', async () => {
      mockJobFindFirst.mockResolvedValue({
        id: 1,
        companyId: 1,
        recruiterId: null,
        status: JobStatus.DRAFT,
        title: 'J1',
        experience: ExperienceLevel.MID,
        employmentType: EmploymentType.LONG_TERM,
        workArrangement: WorkArrangement.REMOTE,
        location: 'Berlin',
        introduction: 'Intro',
        responsibilities: 'Resp',
        requirements: RequirementsLevel.INTERMEDIATE,
        salary: '100k',
      });

      await expect(service.publish(1, ctx, false)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws UnprocessableEntityException when required publish fields are missing', async () => {
      mockJobFindFirst.mockResolvedValue({
        id: 1,
        companyId: 1,
        recruiterId: null,
        status: JobStatus.APPROVED,
        title: 'J1',
        experience: ExperienceLevel.MID,
        employmentType: EmploymentType.LONG_TERM,
        workArrangement: WorkArrangement.REMOTE,
        location: null,
        introduction: '',
        responsibilities: 'Resp',
        requirements: null,
        salary: undefined,
      });

      try {
        await service.publish(1, ctx, false);
        fail('Expected publish to throw UnprocessableEntityException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnprocessableEntityException);
        const response = (error as UnprocessableEntityException).getResponse() as {
          errors: string[];
        };
        expect(response.errors).toEqual(
          expect.arrayContaining([
            'location is required',
            'introduction is required',
            'requirements is required',
            'salary is required',
          ]),
        );
      }
    });

    it('returns updated job when publish validation passes', async () => {
      mockJobFindFirst.mockResolvedValue({
        id: 1,
        companyId: 1,
        recruiterId: null,
        status: JobStatus.APPROVED,
        title: 'J1',
        experience: ExperienceLevel.MID,
        employmentType: EmploymentType.LONG_TERM,
        workArrangement: WorkArrangement.REMOTE,
        location: 'Berlin',
        introduction: 'Intro',
        responsibilities: 'Resp',
        requirements: RequirementsLevel.INTERMEDIATE,
        salary: '100k',
      });
      const updated = {
        id: 1,
        title: 'J1',
        status: JobStatus.LIVE,
        companyId: 1,
        updatedAt: new Date(),
      };
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({
              job: {
                update: () => Promise.resolve(updated),
              },
            }),
          ),
      );

      const result = await service.publish(1, ctx, false);

      expect(result).toEqual(updated);
    });
  });
});
