import { SetMetadata } from '@nestjs/common';

export const RBAC_SCOPE_KEY = 'rbac:scope';

/**
 * Resource scope types for RBAC enforcement
 * - own: User can only access resources they own (e.g., job.recruiterId = userId)
 * - own_assigned: User can access own resources + resources assigned to them (via JobAssignment)
 * - org_wide: User can access all resources in their organization (filtered by companyId only)
 */
export type ResourceScope = 'own' | 'own_assigned' | 'org_wide';

/**
 * Decorator to specify the required scope for a route
 * Used in conjunction with ScopeEnforcementGuard
 * 
 * @example
 * @Get()
 * @RequireScope('own_assigned')  // Recruiter: own + assigned; HM: org-wide
 * async findAll(@Request() req) {
 *   // Service layer applies scope filtering based on role
 * }
 */
export const RequireScope = (scope: ResourceScope) => 
  SetMetadata(RBAC_SCOPE_KEY, scope);
