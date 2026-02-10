import { isOrgWideScope, jobWhereForScope, canAccessJob } from './scope.util';

describe('scope.util', () => {
  describe('isOrgWideScope', () => {
    it('returns true for admin, hm, viewer, reviewer', () => {
      expect(isOrgWideScope('admin')).toBe(true);
      expect(isOrgWideScope('hm')).toBe(true);
      expect(isOrgWideScope('viewer')).toBe(true);
      expect(isOrgWideScope('reviewer')).toBe(true);
    });
    it('returns false for recruiter', () => {
      expect(isOrgWideScope('recruiter')).toBe(false);
    });
    it('is case-insensitive', () => {
      expect(isOrgWideScope('ADMIN')).toBe(true);
      expect(isOrgWideScope('Recruiter')).toBe(false);
    });
  });

  describe('jobWhereForScope', () => {
    it('returns only companyId for org-wide roles', () => {
      expect(jobWhereForScope(1, 100, 'admin')).toEqual({ companyId: 1 });
      expect(jobWhereForScope(2, 100, 'hm')).toEqual({ companyId: 2 });
      expect(jobWhereForScope(1, 100, 'viewer')).toEqual({ companyId: 1 });
    });
    it('returns companyId + OR (recruiterId | jobAssignments) for recruiter', () => {
      const where = jobWhereForScope(1, 100, 'recruiter');
      expect(where.companyId).toBe(1);
      expect(where.OR).toHaveLength(2);
      expect(where.OR).toContainEqual({ recruiterId: 100 });
      expect(where.OR).toContainEqual({
        jobAssignments: {
          some: { recruiterId: 100, isActive: true },
        },
      });
    });
  });

  describe('canAccessJob', () => {
    const companyId = 1;
    const userId = 100;

    it('allows org-wide roles for any job in org', () => {
      expect(
        canAccessJob(
          { companyId: 1, recruiterId: 999 },
          companyId,
          userId,
          'admin',
        ),
      ).toBe(true);
      expect(
        canAccessJob(
          { companyId: 1, recruiterId: null },
          companyId,
          userId,
          'hm',
        ),
      ).toBe(true);
    });
    it('denies wrong org', () => {
      expect(
        canAccessJob(
          { companyId: 2, recruiterId: userId },
          companyId,
          userId,
          'admin',
        ),
      ).toBe(false);
    });
    it('allows recruiter when they own the job', () => {
      expect(
        canAccessJob(
          { companyId: 1, recruiterId: 100 },
          companyId,
          userId,
          'recruiter',
        ),
      ).toBe(true);
    });
    it('allows recruiter when hasAssignment', () => {
      expect(
        canAccessJob(
          { companyId: 1, recruiterId: 999 },
          companyId,
          userId,
          'recruiter',
          true,
        ),
      ).toBe(true);
    });
    it('denies recruiter when not owner and no assignment', () => {
      expect(
        canAccessJob(
          { companyId: 1, recruiterId: 999 },
          companyId,
          userId,
          'recruiter',
        ),
      ).toBe(false);
      expect(
        canAccessJob(
          { companyId: 1, recruiterId: 999 },
          companyId,
          userId,
          'recruiter',
          false,
        ),
      ).toBe(false);
    });
  });
});
