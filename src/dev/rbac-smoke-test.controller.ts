import {
  Controller,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { RequirePermission } from '../rbac/require-permission.decorator';
import { RequirePermissionGuard } from '../rbac/require-permission.guard';
import { OrgContextGuard } from '../common/context/org-context.guard';
import { PrismaService } from '../prisma/prisma.service';

interface RequestUser {
  userId: number;
  email: string;
}

/**
 * RBAC Smoke Test Controller
 * Provides endpoints to validate RBAC configuration
 * 
 * Usage:
 * 1. Login with different roles
 * 2. Call GET /dev/rbac-smoke-test
 * 3. See which endpoints you can access
 * 4. Test each endpoint to verify 200/403 responses
 */
@Controller('dev')
@UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard)
export class RbacSmokeTestController {
  constructor(private prisma: PrismaService) {}

  /**
   * Main smoke test endpoint - shows all available tests
   */
  @Get('rbac-smoke-test')
  @HttpCode(HttpStatus.OK)
  async smokeTest(@CurrentUser() user: RequestUser) {
    // Get user's role
    const membership = await this.prisma.organizationMembership.findFirst({
      where: {
        userId: user.userId,
        isActive: true,
      },
      include: {
        company: {
          select: { id: true, name: true },
        },
        roleAssignments: {
          where: { isActive: true },
          select: { role: true },
        },
      },
    });

    const role = membership?.roleAssignments?.[0]?.role || 'UNKNOWN';
    const orgName = membership?.company?.name || 'Unknown';

    return {
      message: '🧪 RBAC Smoke Test Suite',
      user: {
        id: user.userId,
        email: user.email,
        role: role,
        organization: orgName,
      },
      instructions: 'Test each endpoint below with your current credentials',
      endpoints: [
        {
          name: 'Admin Only',
          method: 'GET',
          url: '/dev/rbac-smoke-test/admin-only',
          permission: 'settings:team_manage',
          expectedRoles: ['ORG_ADMIN'],
          curl: `curl -H "Authorization: Bearer <your_token>" http://localhost:4000/dev/rbac-smoke-test/admin-only`,
        },
        {
          name: 'Recruiter Only',
          method: 'GET',
          url: '/dev/rbac-smoke-test/recruiter-only',
          permission: 'job:create',
          expectedRoles: ['RECRUITER', 'ORG_ADMIN'],
          curl: `curl -H "Authorization: Bearer <your_token>" http://localhost:4000/dev/rbac-smoke-test/recruiter-only`,
        },
        {
          name: 'HM Only',
          method: 'GET',
          url: '/dev/rbac-smoke-test/hm-only',
          permission: 'job:approve',
          expectedRoles: ['HM', 'ORG_ADMIN'],
          curl: `curl -H "Authorization: Bearer <your_token>" http://localhost:4000/dev/rbac-smoke-test/hm-only`,
        },
        {
          name: 'Candidate View',
          method: 'GET',
          url: '/dev/rbac-smoke-test/candidate-view',
          permission: 'candidate:read',
          expectedRoles: ['RECRUITER', 'HM', 'ORG_ADMIN', 'VIEWER'],
          curl: `curl -H "Authorization: Bearer <your_token>" http://localhost:4000/dev/rbac-smoke-test/candidate-view`,
        },
        {
          name: 'Talent Pool Management',
          method: 'GET',
          url: '/dev/rbac-smoke-test/talent-pool',
          permission: 'talent_pool:manage',
          expectedRoles: ['RECRUITER', 'ORG_ADMIN'],
          curl: `curl -H "Authorization: Bearer <your_token>" http://localhost:4000/dev/rbac-smoke-test/talent-pool`,
        },
        {
          name: 'Analytics View',
          method: 'GET',
          url: '/dev/rbac-smoke-test/analytics',
          permission: 'analytics:view',
          expectedRoles: ['HM', 'ORG_ADMIN'],
          curl: `curl -H "Authorization: Bearer <your_token>" http://localhost:4000/dev/rbac-smoke-test/analytics`,
        },
      ],
      testScenarios: {
        crossOrgIsolation: {
          description: 'Verify users cannot access resources from other orgs',
          tests: [
            'Login as recruiter1@example.com (Org A)',
            'Try to access Job 2 (Org B)',
            'Expected: 403 Forbidden or 404 Not Found',
          ],
        },
        scopeEnforcement: {
          description: 'Verify scope restrictions (own vs assigned vs org-wide)',
          tests: [
            'Recruiter can only edit jobs assigned to them',
            'HM can view/approve all jobs in their org',
            'Admin can do everything in their org',
          ],
        },
      },
    };
  }

  /**
   * Admin-only endpoint
   */
  @Get('rbac-smoke-test/admin-only')
  @RequirePermission('settings:team_manage')
  @HttpCode(HttpStatus.OK)
  async adminOnly(@CurrentUser() user: RequestUser) {
    return {
      status: 'PASS ✅',
      message: 'You have admin permissions!',
      permission: 'settings:team_manage',
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * Recruiter-only endpoint
   */
  @Get('rbac-smoke-test/recruiter-only')
  @RequirePermission('job:create')
  @HttpCode(HttpStatus.OK)
  async recruiterOnly(@CurrentUser() user: RequestUser) {
    return {
      status: 'PASS ✅',
      message: 'You have recruiter permissions!',
      permission: 'job:create',
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * HM-only endpoint
   */
  @Get('rbac-smoke-test/hm-only')
  @RequirePermission('job:approve')
  @HttpCode(HttpStatus.OK)
  async hmOnly(@CurrentUser() user: RequestUser) {
    return {
      status: 'PASS ✅',
      message: 'You have HM permissions!',
      permission: 'job:approve',
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * Candidate view endpoint (most roles should have this)
   */
  @Get('rbac-smoke-test/candidate-view')
  @RequirePermission('candidate:read')
  @HttpCode(HttpStatus.OK)
  async candidateView(@CurrentUser() user: RequestUser) {
    return {
      status: 'PASS ✅',
      message: 'You can view candidates!',
      permission: 'candidate:read',
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * Talent pool management (Recruiter + Admin)
   */
  @Get('rbac-smoke-test/talent-pool')
  @RequirePermission('talent_pool:manage')
  @HttpCode(HttpStatus.OK)
  async talentPool(@CurrentUser() user: RequestUser) {
    return {
      status: 'PASS ✅',
      message: 'You can manage talent pools!',
      permission: 'talent_pool:manage',
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * Analytics view (HM + Admin)
   */
  @Get('rbac-smoke-test/analytics')
  @RequirePermission('analytics:view')
  @HttpCode(HttpStatus.OK)
  async analytics(@CurrentUser() user: RequestUser) {
    return {
      status: 'PASS ✅',
      message: 'You can view analytics!',
      permission: 'analytics:view',
      userId: user.userId,
      email: user.email,
    };
  }

  /**
   * Get test data summary
   */
  @Get('rbac-smoke-test/test-data')
  @HttpCode(HttpStatus.OK)
  async testData(@CurrentUser() user: RequestUser) {
    const jobs = await this.prisma.job.findMany({
      select: {
        id: true,
        title: true,
        companyId: true,
        recruiterId: true,
        status: true,
      },
      take: 10,
    });

    const applications = await this.prisma.application.findMany({
      select: {
        id: true,
        jobId: true,
        companyId: true,
        status: true,
      },
      take: 10,
    });

    const assignments = await this.prisma.jobAssignment.findMany({
      select: {
        id: true,
        jobId: true,
        recruiterId: true,
        companyId: true,
        isActive: true,
      },
      take: 10,
    });

    return {
      message: 'Test data summary',
      requestedBy: {
        userId: user.userId,
        email: user.email,
      },
      data: {
        jobs: jobs.length,
        applications: applications.length,
        assignments: assignments.length,
        jobsList: jobs,
        applicationsList: applications,
        assignmentsList: assignments,
      },
    };
  }
}
