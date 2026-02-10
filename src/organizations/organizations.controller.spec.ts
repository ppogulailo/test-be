import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';

describe('OrganizationsController', () => {
  let controller: OrganizationsController;

  const mockListForUser = jest.fn();
  const mockSwitchOrg = jest.fn();
  const mockCanActivate = jest.fn().mockReturnValue(true);

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrganizationsController],
      providers: [
        {
          provide: OrganizationsService,
          useValue: {
            listForUser: mockListForUser,
            switchOrg: mockSwitchOrg,
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: mockCanActivate })
      .overrideGuard(OrgContextGuard)
      .useValue({ canActivate: mockCanActivate })
      .compile();

    controller = module.get<OrganizationsController>(OrganizationsController);
    mockListForUser.mockReset();
    mockSwitchOrg.mockReset();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('list', () => {
    it('returns currentOrgId and orgs from service', async () => {
      const ctx = {
        userId: '1',
        email: 'u@x.com',
        currentOrgId: '1',
        roleKey: 'admin',
        permissions: [],
      };
      const orgs = [
        { orgId: '1', name: 'Org A', isCurrent: true, roleKey: 'admin' },
        { orgId: '2', name: 'Org B', isCurrent: false, roleKey: 'viewer' },
      ];
      mockListForUser.mockResolvedValue(orgs);

      const result = await controller.list(ctx);

      expect(mockListForUser).toHaveBeenCalledWith(1, 1);
      expect(result).toEqual({ currentOrgId: '1', orgs });
    });
  });

  describe('switchOrg', () => {
    it('calls service with userId, email, orgId and returns result', async () => {
      const ctx = {
        userId: '1',
        email: 'u@x.com',
        currentOrgId: '1',
        roleKey: 'admin',
        permissions: [],
      };
      const resolved = {
        currentOrgId: '2',
        roleKey: 'viewer',
        permissions: ['job:read'],
      };
      mockSwitchOrg.mockResolvedValue(resolved);

      const result = await controller.switchOrg(ctx, 2);

      expect(mockSwitchOrg).toHaveBeenCalledWith(1, 'u@x.com', 2);
      expect(result).toEqual(resolved);
    });
  });
});
