import { ForbiddenException } from '@nestjs/common';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequirePermissionGuard } from './require-permission.guard';
import type { RequestWithAuth } from '../common/context/request.types';

describe('RequirePermissionGuard', () => {
  let guard: RequirePermissionGuard;
  let reflector: Reflector;

  const createMockContext = (
    authContext: RequestWithAuth['authContext'],
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ authContext }) as RequestWithAuth,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RequirePermissionGuard(reflector);
  });

  it('allows when no required permissions are set', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const ctx = createMockContext({
      userId: '1',
      email: 'u@x.com',
      currentOrgId: '1',
      roleKey: 'admin',
      permissions: ['job:read'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('allows when user has all required permissions', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue(['job:read', 'job:create']);
    const ctx = createMockContext({
      userId: '1',
      email: 'u@x.com',
      currentOrgId: '1',
      roleKey: 'admin',
      permissions: ['job:read', 'job:create', 'job:publish'],
    });
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('throws ForbiddenException when user is missing a required permission', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['job:publish']);
    const ctx = createMockContext({
      userId: '1',
      email: 'u@x.com',
      currentOrgId: '1',
      roleKey: 'viewer',
      permissions: ['job:read'],
    });
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Missing required permission');
  });

  it('throws ForbiddenException when authContext is missing', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['job:read']);
    const ctx = createMockContext(
      undefined as unknown as RequestWithAuth['authContext'],
    );
    expect(() => guard.canActivate(ctx)).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx)).toThrow('Missing auth context');
  });
});
