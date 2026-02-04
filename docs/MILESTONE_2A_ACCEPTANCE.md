# Milestone 2A – RBAC + org isolation (acceptance)

## Scope rules

| Role     | Jobs scope              | Applications scope        |
|----------|-------------------------|----------------------------|
| **Admin**  | Org-wide (all in org)   | Org-wide                   |
| **HM**     | Org-wide                | Org-wide                   |
| **Viewer** | Org-wide (read-only)    | Org-wide (read-only)       |
| **Reviewer** | Org-wide (read-only)  | Org-wide (read-only)       |
| **Recruiter** | Own or assigned only | Only for jobs they own or are assigned to |

- **Own** = job.recruiterId = current user.
- **Assigned** = active row in `job_assignments` for (jobId, recruiterId = current user).
- Server-side permission guards (`@RequirePermission`) plus these scope rules are applied in `JobsService` and `ApplicationsService`; controllers pass `userId` and `roleKey` from auth context.

## Role → permission mapping (verified by tests)

- **Admin:** job:create, job:read, job:update, job:delete, job:publish.
- **Recruiter:** job:create, job:read, job:update, job:publish (no job:delete).
- **Viewer:** job:read only.
- **HM:** same job permissions as Recruiter (scope is org-wide).
- **Reviewer:** job:read.

Tests: `src/common/rbac/scope.util.spec.ts`, `src/rbac/role-permission-matrix.spec.ts`.

## Endpoints covered

| Method | Endpoint | Permission | Scope |
|--------|----------|------------|--------|
| GET | /jobs | job:read | By role (Recruiter: own/assigned; Admin/HM/Viewer/Reviewer: org-wide) |
| GET | /jobs/:id | job:read | Same; 403 if Recruiter and not own/assigned |
| POST | /jobs | job:create | Current org; Recruiter becomes owner (recruiterId) |
| POST | /jobs/publish | job:publish | Same; Recruiter: only if own/assigned |
| POST | /jobs/:id/publish | job:publish | Same |
| GET | /applications | job:read | By role (Recruiter: jobs own/assigned; others: org-wide). Optional ?jobId= |

All require JWT + org context. List of endpoints also in Swagger (http://localhost:4000/api) and `docs/api-reference.md`.

## How to verify

1. **Permission 403:** Sign in as a user with Viewer in one org. Call POST /jobs or POST /jobs/:id/publish → 403 (missing job:create / job:publish).
2. **Admin org-wide:** Sign in as Admin in org A. GET /jobs → all jobs in org A. Create a job → 201; GET /jobs/:id for that job → 200.
3. **Recruiter own/assigned:** Sign in as Recruiter. GET /jobs → only jobs where recruiterId = user or user has active JobAssignment. GET /jobs/:id for a job owned by another recruiter (no assignment) → 403. Create job → 201 (user becomes owner); GET /jobs → includes the new job.
4. **Run tests:** `npm test` (scope.util.spec, role-permission-matrix.spec).
