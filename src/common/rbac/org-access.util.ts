import { ForbiddenException } from '@nestjs/common';

/**
 * Asserts that the entity belongs to the current organization.
 * Use server-side only when checking access to a resource by org.
 * @throws ForbiddenException if entityOrgId !== currentOrgId
 */
export function assertOrgAccess(
  entityOrgId: number,
  currentOrgId: number | string,
): void {
  const current = typeof currentOrgId === 'string' ? parseInt(currentOrgId, 10) : currentOrgId;
  if (Number.isNaN(current) || entityOrgId !== current) {
    throw new ForbiddenException('Access denied: resource does not belong to your organization');
  }
}
