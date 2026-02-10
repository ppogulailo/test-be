import { ForbiddenException } from '@nestjs/common';
import { assertOrgAccess } from './org-access.util';

describe('org-access.util', () => {
  describe('assertOrgAccess', () => {
    it('does not throw when entity belongs to current org', () => {
      expect(() => assertOrgAccess(1, 1)).not.toThrow();
      expect(() => assertOrgAccess(2, '2')).not.toThrow();
    });

    it('throws ForbiddenException when entity org differs from current org', () => {
      expect(() => assertOrgAccess(1, 2)).toThrow(ForbiddenException);
      expect(() => assertOrgAccess(2, 1)).toThrow(ForbiddenException);
      expect(() => assertOrgAccess(1, '2')).toThrow(ForbiddenException);
    });

    it('throws when currentOrgId is NaN (invalid)', () => {
      expect(() => assertOrgAccess(1, NaN)).toThrow(ForbiddenException);
      expect(() => assertOrgAccess(1, '')).toThrow(ForbiddenException);
    });

    it('message indicates resource does not belong to organization', () => {
      try {
        assertOrgAccess(1, 2);
      } catch (e) {
        expect(e).toBeInstanceOf(ForbiddenException);
        expect((e as ForbiddenException).message).toContain('organization');
      }
    });
  });
});
