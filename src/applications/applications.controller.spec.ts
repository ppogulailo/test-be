import { Test, TestingModule } from '@nestjs/testing';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';

describe('ApplicationsController', () => {
  let controller: ApplicationsController;

  const mockList = jest.fn();
  const mockCanActivate = jest.fn().mockReturnValue(true);

  const auth = {
    currentOrgId: '1',
    userId: '10',
    roleKey: 'admin',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ApplicationsController],
      providers: [
        {
          provide: ApplicationsService,
          useValue: { list: mockList },
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

    controller = module.get<ApplicationsController>(ApplicationsController);
    mockList.mockReset();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('calls service.list with scope context and no jobId', async () => {
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
      mockList.mockResolvedValue(apps);

      const result = await controller.list(auth);

      expect(mockList).toHaveBeenCalledWith(
        {
          companyId: 1,
          userId: 10,
          roleKey: 'admin',
        },
        undefined,
      );
      expect(result).toEqual(apps);
    });

    it('calls service.list with jobId when query provided', async () => {
      const apps: unknown[] = [];
      mockList.mockResolvedValue(apps);

      const result = await controller.list(auth, 5);

      expect(mockList).toHaveBeenCalledWith(
        {
          companyId: 1,
          userId: 10,
          roleKey: 'admin',
        },
        5,
      );
      expect(result).toEqual(apps);
    });
  });
});
