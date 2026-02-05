import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsService } from './applications.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: PrismaService;

  const mockRunWithOrgContext = jest.fn();
  const mockJobFindMany = jest.fn();

  const ctx = {
    companyId: 1,
    userId: 10,
    roleKey: 'admin',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApplicationsService,
        {
          provide: PrismaService,
          useValue: {
            runWithOrgContext: mockRunWithOrgContext,
            job: { findMany: mockJobFindMany },
          },
        },
      ],
    }).compile();

    service = module.get<ApplicationsService>(ApplicationsService);
    prisma = module.get<PrismaService>(PrismaService);
    mockRunWithOrgContext.mockReset();
    mockJobFindMany.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('list', () => {
    it('for org-wide role calls runWithOrgContext and returns applications', async () => {
      const apps = [
        {
          id: 1,
          jobId: 1,
          candidateProfileId: 1,
          companyId: 1,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({
              application: {
                findMany: () => Promise.resolve(apps),
              },
            }),
          ),
      );

      const result = await service.list(ctx);

      expect(mockRunWithOrgContext).toHaveBeenCalledWith(1, expect.any(Function));
      expect(result).toEqual(apps);
    });

    it('for org-wide role with jobId filters by jobId', async () => {
      const apps: unknown[] = [];
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) => {
          const findMany = jest.fn().mockResolvedValue(apps);
          return Promise.resolve(
            fn({ application: { findMany } }),
          ).then(() => {
            expect(findMany).toHaveBeenCalledWith(
              expect.objectContaining({
                where: expect.objectContaining({ jobId: 3 }),
              }),
            );
          });
        },
      );

      await service.list(ctx, 3);

      expect(mockRunWithOrgContext).toHaveBeenCalledWith(1, expect.any(Function));
    });

    it('for recruiter role returns only applications for visible jobs', async () => {
      const recruiterCtx = { ...ctx, roleKey: 'recruiter' };
      mockJobFindMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);
      const apps = [
        {
          id: 1,
          jobId: 1,
          candidateProfileId: 1,
          companyId: 1,
          status: 'SUBMITTED',
          submittedAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockRunWithOrgContext.mockImplementation(
        (_orgId: number, fn: (tx: unknown) => Promise<unknown>) =>
          Promise.resolve(
            fn({
              application: {
                findMany: () => Promise.resolve(apps),
              },
            }),
          ),
      );

      const result = await service.list(recruiterCtx);

      expect(mockJobFindMany).toHaveBeenCalled();
      expect(mockRunWithOrgContext).toHaveBeenCalledWith(1, expect.any(Function));
      expect(result).toEqual(apps);
    });

    it('for recruiter with no visible jobs returns empty array', async () => {
      const recruiterCtx = { ...ctx, roleKey: 'recruiter' };
      mockJobFindMany.mockResolvedValue([]);

      const result = await service.list(recruiterCtx);

      expect(result).toEqual([]);
      expect(mockRunWithOrgContext).not.toHaveBeenCalled();
    });
  });
});
