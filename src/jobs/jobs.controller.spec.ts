import { Test, TestingModule } from '@nestjs/testing';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import {
  EmploymentType,
  ExperienceLevel,
  WorkArrangement,
} from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';

describe('JobsController', () => {
  let controller: JobsController;

  const mockList = jest.fn();
  const mockGetOne = jest.fn();
  const mockCreate = jest.fn();
  const mockPublish = jest.fn();
  const mockCanActivate = jest.fn().mockReturnValue(true);

  const auth = {
    currentOrgId: '1',
    userId: '10',
    roleKey: 'admin',
  };

  const createJobDto = {
    title: 'Test Job',
    experience: ExperienceLevel.MID,
    employmentType: EmploymentType.LONG_TERM,
    workArrangement: WorkArrangement.REMOTE,
    responsibilities: [],
    requirements: [],
    niceToHave: [],
    perks: [],
    whoYouAre: [],
    tags: [],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: {
            list: mockList,
            getOne: mockGetOne,
            create: mockCreate,
            publish: mockPublish,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: mockCanActivate })
      .overrideGuard(OrgContextGuard)
      .useValue({ canActivate: mockCanActivate })
      .overrideGuard(RequirePermissionGuard)
      .useValue({ canActivate: mockCanActivate })
      .compile();

    controller = module.get<JobsController>(JobsController);
    mockList.mockReset();
    mockGetOne.mockReset();
    mockCreate.mockReset();
    mockPublish.mockReset();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('calls service.list with scope context from auth', async () => {
      const jobs = [
        {
          id: 1,
          title: 'J1',
          status: 'DRAFT',
          companyId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockList.mockResolvedValue(jobs);

      const result = await controller.list(auth);

      expect(mockList).toHaveBeenCalledWith({
        companyId: 1,
        userId: 10,
        roleKey: 'admin',
      });
      expect(result).toEqual(jobs);
    });
  });

  describe('getOne', () => {
    it('calls service.getOne with id and scope context', async () => {
      const job = {
        id: 1,
        title: 'J1',
        status: 'DRAFT',
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockGetOne.mockResolvedValue(job);

      const result = await controller.getOne(1, auth);

      expect(mockGetOne).toHaveBeenCalledWith(1, {
        companyId: 1,
        userId: 10,
        roleKey: 'admin',
      });
      expect(result).toEqual(job);
    });
  });

  describe('create', () => {
    it('calls service.create with scope context and dto', async () => {
      const created = {
        id: 1,
        title: 'Test Job',
        status: 'DRAFT',
        companyId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCreate.mockResolvedValue(created);

      const result = await controller.create(auth, createJobDto);

      expect(mockCreate).toHaveBeenCalledWith(
        { companyId: 1, userId: 10, roleKey: 'admin' },
        createJobDto,
      );
      expect(result).toEqual(created);
    });
  });

  describe('publishByBody', () => {
    it('calls service.publish with jobId from body and scope context', async () => {
      const updated = {
        id: 1,
        title: 'J1',
        status: 'LIVE',
        companyId: 1,
        updatedAt: new Date(),
      };
      mockPublish.mockResolvedValue(updated);

      const result = await controller.publishByBody(5, auth);

      expect(mockPublish).toHaveBeenCalledWith(5, {
        companyId: 1,
        userId: 10,
        roleKey: 'admin',
      });
      expect(result).toEqual(updated);
    });
  });

  describe('publishById', () => {
    it('calls service.publish with id from path and scope context', async () => {
      const updated = {
        id: 3,
        title: 'J3',
        status: 'LIVE',
        companyId: 1,
        updatedAt: new Date(),
      };
      mockPublish.mockResolvedValue(updated);

      const result = await controller.publishById(3, auth);

      expect(mockPublish).toHaveBeenCalledWith(3, {
        companyId: 1,
        userId: 10,
        roleKey: 'admin',
      });
      expect(result).toEqual(updated);
    });
  });
});
