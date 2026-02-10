import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AccessRole } from '@prisma/client';
import { OrganizationsService } from './organizations.service';
import { PrismaService } from '../prisma/prisma.service';
import { OrgContextService } from '../common/context/org-context.service';

describe('OrganizationsService', () => {
  let service: OrganizationsService;

  const mockFindMany = jest.fn();
  const mockFindFirst = jest.fn();
  const mockSetCurrentOrg = jest.fn();
  const mockResolveAuthContextForOrg = jest.fn();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationsService,
        {
          provide: PrismaService,
          useValue: {
            organizationMembership: {
              findMany: mockFindMany,
              findFirst: mockFindFirst,
            },
          },
        },
        {
          provide: OrgContextService,
          useValue: {
            setCurrentOrg: mockSetCurrentOrg,
            resolveAuthContextForOrg: mockResolveAuthContextForOrg,
          },
        },
      ],
    }).compile();

    service = module.get<OrganizationsService>(OrganizationsService);
    mockFindMany.mockReset();
    mockFindFirst.mockReset();
    mockSetCurrentOrg.mockResolvedValue(undefined);
    mockResolveAuthContextForOrg.mockReset();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('listForUser', () => {
    it('returns orgs with orgId, name, isCurrent, roleKey', async () => {
      mockFindMany.mockResolvedValue([
        {
          company: { id: 1, name: 'Org A' },
          roleAssignments: [{ role: AccessRole.ORG_ADMIN }],
        },
        {
          company: { id: 2, name: 'Org B' },
          roleAssignments: [{ role: AccessRole.VIEWER }],
        },
      ]);

      const result = await service.listForUser(1, 1);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: 1, isActive: true },
          orderBy: { joinedAt: 'asc' },
        }),
      );
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        orgId: '1',
        name: 'Org A',
        isCurrent: true,
        roleKey: 'admin',
      });
      expect(result[1]).toEqual({
        orgId: '2',
        name: 'Org B',
        isCurrent: false,
        roleKey: 'viewer',
      });
    });

    it('uses RECRUITER as default role when no role assignment', async () => {
      mockFindMany.mockResolvedValue([
        {
          company: { id: 1, name: 'Org A' },
          roleAssignments: [],
        },
      ]);

      const result = await service.listForUser(1, 1);

      expect(result[0].roleKey).toBe('recruiter');
    });
  });

  describe('switchOrg', () => {
    it('throws NotFoundException when user is not a member of org', async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(service.switchOrg(1, 'u@x.com', 99)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.switchOrg(1, 'u@x.com', 99)).rejects.toThrow(
        'Organization not found for user',
      );
      expect(mockSetCurrentOrg).not.toHaveBeenCalled();
    });

    it('calls setCurrentOrg and resolveAuthContextForOrg when membership exists', async () => {
      mockFindFirst.mockResolvedValue({ id: 1 });
      mockResolveAuthContextForOrg.mockResolvedValue({
        currentOrgId: '2',
        roleKey: 'viewer',
        permissions: ['job:read'],
      });

      const result = await service.switchOrg(1, 'u@x.com', 2);

      expect(mockSetCurrentOrg).toHaveBeenCalledWith(1, 2);
      expect(mockResolveAuthContextForOrg).toHaveBeenCalledWith(
        { userId: 1, email: 'u@x.com' },
        2,
      );
      expect(result).toEqual({
        currentOrgId: '2',
        roleKey: 'viewer',
        permissions: ['job:read'],
      });
    });
  });
});
