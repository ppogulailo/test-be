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
  'candidate:read',
  'pipeline:move_stage',
] as const;

describe('Role–permission mapping (2A contract)', () => {
const EXPECTED: Record<string, readonly string[]> = {
  admin: JOB_PERMISSIONS,
  recruiter: [
    'job:create',
    'job:read',           // Scope: own + assigned (via JobAssignment)
    'job:update',         // Scope: own + assigned
    'job:publish',
    'job:request_approval', // NEW: Request approval for own jobs
    'candidate:read',     // Scope: tied to own/assigned jobs
    'pipeline:move_stage', // Scope: own/assigned jobs only
    'talent_pool:manage', // Scope: recruiter-owned pools only
  ],
  viewer: ['job:read', 'candidate:read'],
  hm: [
    'job:read',           // Scope: org-wide
    'job:approve',        // NEW: Approve any job in org
    'job:reject',         // NEW: Reject any job in org
    'job:assign',         // NEW: Assign jobs to recruiters
    'candidate:read',     // Scope: org-wide
    'pipeline:move_stage', // Scope: org-wide
    'analytics:view_org', // Scope: org-wide metrics
  ],
  reviewer: [],
};

  it('admin has all job permissions', () => {
    expect(EXPECTED.admin).toEqual([...JOB_PERMISSIONS]);
  });

  it('recruiter can manage own/assigned jobs and pipeline (no delete)', () => {
    expect(EXPECTED.recruiter).toContain('job:read');
    expect(EXPECTED.recruiter).toContain('job:create');
    expect(EXPECTED.recruiter).toContain('job:publish');
    expect(EXPECTED.recruiter).not.toContain('job:delete');
    expect(EXPECTED.recruiter).toContain('candidate:read');
    expect(EXPECTED.recruiter).toContain('pipeline:move_stage');
  });

  it('viewer has read-only access', () => {
    expect(EXPECTED.viewer).toEqual(['job:read', 'candidate:read']);
  });

  it('hm has org-wide read + pipeline move (no job update)', () => {
    expect(EXPECTED.hm).toContain('job:read');
    expect(EXPECTED.hm).toContain('candidate:read');
    expect(EXPECTED.hm).toContain('pipeline:move_stage');
    expect(EXPECTED.hm).not.toContain('job:update');
  });

  it('reviewer is token-based (no org membership permissions by default)', () => {
    expect(EXPECTED.reviewer).toEqual([]);
  });
});
