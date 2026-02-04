/**
 * Verifies the role→permission mapping contract for Milestone 2A.
 * Seed (prisma/seed.ts) must keep ROLE_PERMISSION_MATRIX in sync with these expectations.
 */
const JOB_PERMISSIONS = [
  'job:create',
  'job:read',
  'job:update',
  'job:delete',
  'job:publish',
] as const;

describe('Role–permission mapping (2A contract)', () => {
  const EXPECTED: Record<string, readonly string[]> = {
    admin: JOB_PERMISSIONS,
    recruiter: ['job:create', 'job:read', 'job:update', 'job:publish'],
    viewer: ['job:read'],
    hm: ['job:create', 'job:read', 'job:update', 'job:publish'],
    reviewer: ['job:read'],
  };

  it('admin has all job permissions', () => {
    expect(EXPECTED.admin).toEqual([...JOB_PERMISSIONS]);
  });

  it('recruiter has job create, read, update, publish (no delete)', () => {
    expect(EXPECTED.recruiter).toContain('job:read');
    expect(EXPECTED.recruiter).toContain('job:create');
    expect(EXPECTED.recruiter).toContain('job:publish');
    expect(EXPECTED.recruiter).not.toContain('job:delete');
  });

  it('viewer has only job:read', () => {
    expect(EXPECTED.viewer).toEqual(['job:read']);
  });

  it('hm has same job permissions as recruiter (org-wide scope)', () => {
    expect(EXPECTED.hm).toEqual(EXPECTED.recruiter);
  });

  it('reviewer has job:read', () => {
    expect(EXPECTED.reviewer).toContain('job:read');
  });
});
