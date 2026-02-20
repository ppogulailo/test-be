import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RBAC_SCOPE_KEY, ResourceScope } from './scope-enforcement.decorator';
import { RequestWithAuth } from '../common/context/request.types';

/**
 * Scope Enforcement Guard
 * 
 * Ensures that the user's role allows access to the requested scope.
 * This guard checks if the user's role is compatible with the required scope,
 * but the actual data filtering happens in the service layer.
 * 
 * Scope Rules:
 * - org_wide: Only HM and ORG_ADMIN roles can access
 * - own_assigned: RECRUITER, HM, and ORG_ADMIN roles can access
 *   - Recruiter: Service filters by JobAssignment (own + assigned)
 *   - HM/Admin: Service returns org-wide data
 * - own: Any authenticated user with org membership can access their own resources
 * 
 * Usage:
 * Apply to controller or method along with RequirePermissionGuard:
 * 
 * @UseGuards(JwtAuthGuard, OrgContextGuard, RequirePermissionGuard, ScopeEnforcementGuard)
 * @RequirePermission('job:read')
 * @RequireScope('own_assigned')
 * async findAll(@Request() req) { ... }
 */
@Injectable()
export class ScopeEnforcementGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScope = this.reflector.getAllAndOverride<ResourceScope>(
      RBAC_SCOPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no scope requirement specified, allow access
    if (!requiredScope) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithAuth>();
    const ctx = req.authContext;

    if (!ctx) {
      throw new ForbiddenException('Missing auth context');
    }

    const userRole = ctx.roleKey; // e.g., 'RECRUITER', 'HM', 'ORG_ADMIN'

    // Check if user's role allows the required scope
    switch (requiredScope) {
      case 'org_wide':
        // Only HM and ORG_ADMIN can access org-wide resources
        if (!['HM', 'ORG_ADMIN'].includes(userRole)) {
          throw new ForbiddenException(
            'Insufficient role for org-wide access. Only Hiring Manager or Admin can access organization-wide resources.',
          );
        }
        break;

      case 'own_assigned':
        // Recruiter can access own + assigned, HM/Admin can access all
        if (!['RECRUITER', 'HM', 'ORG_ADMIN'].includes(userRole)) {
          throw new ForbiddenException(
            'Insufficient role for assigned access. Requires Recruiter, Hiring Manager, or Admin role.',
          );
        }
        // Note: Actual filtering happens in service layer
        // - Recruiter: Filtered by JobAssignment table
        // - HM/Admin: Org-wide (no additional filter)
        break;

      case 'own':
        // Any authenticated org member can access their own resources
        // No additional role check needed
        break;

      default:
        throw new ForbiddenException(`Unknown scope requirement: ${requiredScope}`);
    }

    return true;
  }
}
