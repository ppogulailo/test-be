import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CandidatesService } from './candidates.service';
import { PrismaService } from '../prisma/prisma.service';

describe('CandidatesService', () => {
  let service: CandidatesService;

  const mockRunWithOrgContext = jest.fn();
  const mockJobFindMany = jest.fn();

  const ctx = { companyId: 1, userId: 10, roleKey: 'admin' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidatesService,
        {
          provide: PrismaService,
          useValue: {
            runWithOrgContext: mockRunWithOrgContext,
            job: { findMany: mockJobFindMany },
          },
        },
      ],
    }).compile();

    service = module.get<CandidatesService>(CandidatesService);
    mockRunWithOrgContext.mockReset();
    mockJobFindMany.mockReset();
  });

  it('org-wide role lists candidates in org', async () => {
    const candidates = [{ id: 1 }, { id: 2 }];
    mockRunWithOrgContext.mockImplementation(
      (_orgId: number, fn: (tx: any) => Promise<any>) =>
        fn({ candidateProfile: { findMany: () => Promise.resolve(candidates) } }),
    );

    const result = await service.list(ctx);
    expect(result).toEqual(candidates);
  });

  it('recruiter with no visible jobs returns empty list', async () => {
    mockJobFindMany.mockResolvedValue([]);
    const result = await service.list({ ...ctx, roleKey: 'recruiter' });
    expect(result).toEqual([]);
    expect(mockRunWithOrgContext).not.toHaveBeenCalled();
  });

  it('org-wide getOne throws 404 if candidate not found', async () => {
    mockRunWithOrgContext.mockImplementation(
      (_orgId: number, fn: (tx: any) => Promise<any>) =>
        fn({ candidateProfile: { findFirst: () => Promise.resolve(null) } }),
    );
    await expect(service.getOne(123, ctx)).rejects.toThrow(NotFoundException);
  });

  it('recruiter getOne throws 403 if candidate not tied to visible jobs', async () => {
    mockJobFindMany.mockResolvedValue([{ id: 1 }]);
    mockRunWithOrgContext.mockImplementation(
      (_orgId: number, fn: (tx: any) => Promise<any>) =>
        fn({ candidateProfile: { findFirst: () => Promise.resolve(null) } }),
    );
    await expect(service.getOne(123, { ...ctx, roleKey: 'recruiter' })).rejects.toThrow(
      ForbiddenException,
    );
  });
});

