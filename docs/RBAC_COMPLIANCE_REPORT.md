# Ferdge RBAC Specification – Compliance Report (Backend)

This document checks the current backend implementation against the **Ferdge RBAC Specification (Recruiter Side) RLS-based** and **Candidate RBAC**.

---

## 1. Overview & Multi-Tenant Model

| Requirement | Status | Notes |
|-------------|--------|--------|
| Organisations with recruiter teams | ✅ | `Company`, `OrganizationMembership` |
| Users belong to orgs via membership | ✅ | `OrganizationMembership` with `userId`, `companyId` |
| Membership has one or more roles | ✅ | `MembershipRole` (org-level and department-level) |
| Roles control pages, data, actions | ⚠️ Partial | Permission checks exist; **scope rules** (which rows) are not applied in services |
| RBAC vs subscription separate | ⚠️ Partial | Schema has `SubscriptionPlanFeature`, `OrganizationQuotaUsage`; **no runtime checks** after RBAC |

---

## 2. Recruiter-Side Roles (Schema & Permissions)

| Role | In schema | Permissions in seed | Spec expectation |
|------|------------|---------------------|------------------|
| ORG_ADMIN | ✅ | All `job:*` | Full access; seed aligns for job domain only |
| HM | ✅ | **[]** | Full view, approve, core values, analytics, comparison – **not seeded** |
| RECRUITER | ✅ | job:create, read, update, publish | Scoped to own/assigned jobs – **scope not enforced** |
| REVIEWER | ✅ | **[]** | Magic-link; view shortlist, add feedback – **no permissions or magic-link auth** |
| VIEWER | ✅ (schema) | job:read | Not in spec; may be legacy |

**Gaps:**

- **HM** has no permissions in seed; spec requires full view, job approve, core values, analytics, comparison.
- **REVIEWER** has no permissions and no magic-link authentication flow.
- **Canonical permission domains** from spec §4 (Job, Pipeline, Talent Pool, Messaging, Core Values, Analytics, Feedback) are only partially present: only `job:*` permissions exist in seed and are used in controllers. No `pipeline:*`, `talent_pool:*`, `analytics:*`, `feedback:*`, etc.

---

## 3. Permission Enforcement (Backend)

| Requirement | Status | Notes |
|-------------|--------|--------|
| Load memberships + roles + permissions on request | ✅ | `OrgContextService.resolveAuthContext` |
| Attach to session/request | ✅ | `req.authContext` (userId, currentOrgId, roleKey, permissions) |
| `requirePermission("x:y")` | ✅ | `@RequirePermission`, `RequirePermissionGuard` |
| `requireRole("RECRUITER")` | ❌ | No role-based guard; only permission-based |
| `restrictScopeTo("own_jobs")` | ❌ | `RolePermissionMapping.scopeRestriction` exists in schema but **never read or applied** in guards or services |
| Row-level logic (SQL/Prisma filters) | ❌ | No Recruiter vs HM/Admin scope applied in job/pipeline/talent pool queries |

**Scope rules from spec:**

- **Recruiter:** `WHERE recruiter_id = current_user` or job in `JobAssignment` for current user – **not implemented** in jobs (or any) controller/service.
- **HM/Admin:** `WHERE organization_id = current_org` – **not implemented** (jobs are not filtered by org in a scope-aware way).
- **Reviewer:** `WHERE job_id = magic_link_job_id` – **not implemented**; no reviewer auth path.

---

## 4. Jobs Controller & Job Scope

| Requirement | Status | Notes |
|-------------|--------|--------|
| Permission check (e.g. job:create, job:publish) | ✅ | `@RequirePermission` on POST /jobs, POST /jobs/publish |
| Scope: Recruiter sees only own/assigned jobs | ❌ | No list/filter by `recruiterId` or `JobAssignment` |
| Scope: HM/Admin see all org jobs | ❌ | No org-scoped job listing |
| Actual create/publish logic (DB) | ❌ | Controller returns `{ ok: true, orgId }`; no Prisma create/publish |

---

## 5. Pipeline, Talent Pool, Analytics, Messaging

| Domain | Scope in spec | Implemented |
|--------|----------------|-------------|
| Pipeline | Recruiter: assigned jobs; HM/Admin: org | ❌ No pipeline controller; no scope logic |
| Talent Pool | Recruiter: own slice; HM/Admin: org | ❌ No talent pool controller; schema has `ownerRecruiterId` |
| Analytics | Recruiter: own; HM/Admin: org | ❌ No analytics endpoints |
| Messaging | (Spec §4.4) | ❌ No messaging RBAC or scope in backend |

Schema supports ownership (`TalentPool.ownerRecruiterId`, `TalentPoolEntry.ownerRecruiterId`, `Job.recruiterId`, `JobAssignment`) but no services apply these for filtering.

---

## 6. Reviewer Mode (Magic Link)

| Requirement | Status | Notes |
|-------------|--------|--------|
| ReviewerSession model | ✅ | `ReviewerSession` (jobId, tokenHash, expiresAt, status) |
| Token claims: role=REVIEWER, job_id, organization_id, expires_at | ❌ | No JWT or session that carries reviewer context |
| Auth path for magic link | ❌ | No guard/strategy that validates link token and sets `req.authContext` with job_id scope |
| Access limited to job overview, shortlist, feedback form | ❌ | No reviewer-specific routes or scope checks |

---

## 7. Candidate RBAC (Section 2A)

| Requirement | Status | Notes |
|-------------|--------|--------|
| Candidate = User.type CANDIDATE | ✅ | Schema and `/auth/me` return role `candidate` for `UserType.CANDIDATE` |
| Core rule: candidate_id = current_user_id | ❌ | No candidate-scoped APIs; no guard that resolves candidate profile from user and applies filter |
| Candidate portal / org context | ❌ | `OrgContextGuard` requires org membership; candidates typically have no org → would get "no active organization membership" on org-dependent routes |
| Visibility: public jobs + jobs they applied to | ❌ | No endpoint that returns jobs with `is_active = true` OR `job_applications.candidate_id = current_user` |
| MVM: only own scores | ❌ | No endpoint that returns `candidate_job_mvm` with `candidate_id = current_user_id` |
| MVM recalculation: only for self | ❌ | No MVM recalculation endpoint with candidate scope check |
| Aggregates (avg MVM, applicant count) for candidate-visible jobs | ❌ | `JobStats` exists in schema; no API that joins jobs + job_stats and enforces candidate visibility |
| Candidate 6-month form: only candidate can open | ❌ | No feedback endpoints; no RBAC that blocks HM/Recruiter from candidate form |

---

## 8. Feedback & Post-Hire (Section 4.7)

| Requirement | Status | Notes |
|-------------|--------|--------|
| FeedbackTask, T0/T+3/T+6, links to candidate/job/placement/org | ✅ | Schema: `FeedbackTask`, `InternalFeedbackPostInterview`, `InternalFeedback6MonthClient`, `CandidateFeedback6Month` |
| Link must not bypass RBAC | N/A | No endpoint that consumes feedback link token and checks user/org/role |
| Backend checks: user in org, role (HM/Recruiter/Reviewer for T0; HM/Recruiter for T+3/T+6) | ❌ | No feedback route handlers |
| Candidate 6-month form: only candidate can open | ❌ | No candidate-only feedback endpoint |

---

## 9. Subscription & Feature Flags

| Requirement | Status | Notes |
|-------------|--------|--------|
| RBAC first, then subscription | N/A | No subscription checks implemented |
| Feature flags (e.g. Team Access Management) | ❌ | `SubscriptionPlanFeature` in schema; no runtime checks |
| Quotas (e.g. max jobs per org) | ❌ | `OrganizationQuotaUsage` in schema; no check before create/publish |

---

## 10. RLS (Postgres Row-Level Security)

| Requirement | Status | Notes |
|-------------|--------|--------|
| Optional RLS in spec | ❌ | No RLS policies in migrations; all enforcement would be in application layer (and currently missing) |

---

## 11. Frontend

The spec also addresses frontend (hide disallowed UI; never trust frontend alone). This repository is **backend only**. Frontend compliance (permission flags, role maps, conditional rendering) should be checked in the frontend codebase.

---

## 12. Summary Table

| Area | Implemented | Missing / Incomplete |
|------|-------------|----------------------|
| Multi-tenant + memberships + roles | ✅ | — |
| Permission model (AccessPermission, RolePermissionMapping) | ✅ | scopeRestriction not used |
| Auth context (org, role, permissions) | ✅ | — |
| @RequirePermission + guard | ✅ | requireRole, restrictScopeTo not implemented |
| Job permission checks (create/publish) | ✅ | No scope; no real create/publish logic |
| Job/Pipeline/Talent Pool scope (Recruiter vs HM/Admin) | ❌ | No WHERE filters by recruiter/org |
| HM permissions | ❌ | Empty in seed; no domain permissions |
| REVIEWER + magic link | ❌ | No auth path or scoped routes |
| Candidate RBAC (all 2A) | ❌ | No candidate-scoped APIs or guards |
| Feedback RBAC & link validation | ❌ | No endpoints or role checks |
| Subscription / feature flags / quotas | ❌ | Schema only; no runtime checks |
| RLS | ❌ | Not used |
| Full permission matrix (all domains) | ❌ | Only job:* in seed and in use |

---

## 13. Recommendations

1. **Scope enforcement**  
   Implement scope in services: for each role (Recruiter, HM, Admin), apply the spec’s WHERE rules (e.g. Recruiter: jobs where `recruiterId = userId` or job in `JobAssignment` for user; HM/Admin: `companyId = currentOrgId`). Optionally read and enforce `RolePermissionMapping.scopeRestriction` in a guard or helper.

2. **HM & REVIEWER permissions**  
   Seed HM with the permissions from the spec (job, pipeline, talent_pool, analytics, feedback, etc.). Define REVIEWER permissions for the magic-link job only and use them in reviewer routes.

3. **Reviewer magic link**  
   Add an auth path (e.g. token in query or cookie) that validates `ReviewerSession` (token hash, expiry, status), then sets `req.authContext` with a reviewer role and `jobId` (and optionally `organizationId`) so all reviewer routes can restrict to that job.

4. **Candidate RBAC**  
   - For candidate portal, either skip `OrgContextGuard` or use a separate “candidate” auth context (no org; identity = user + candidate profile id).  
   - Add endpoints for: list jobs (public + applied), own MVM scores, MVM refresh (self only), job aggregates (avg MVM, applicant count) for those jobs. Every candidate query must filter by `candidateProfileId` derived from `current user` (e.g. `CandidateProfile.userId = req.user.userId`).

5. **Feedback links**  
   Implement endpoints that resolve feedback by `emailLinkToken` (or similar), then check authenticated user: org membership and role (HM/Recruiter/Reviewer for T0; HM/Recruiter for T+3/T+6). For candidate 6-month form, allow only when `User.type === CANDIDATE` and `candidateProfileId` matches the feedback task.

6. **Subscription**  
   After a successful RBAC check (e.g. “user may create job”), check `SubscriptionPlanFeature` and `OrganizationQuotaUsage` for the current org and feature/quota before performing the action.

7. **Permission matrix**  
   Extend seed (and `AccessPermission` / `RolePermissionMapping`) to include all domains from spec §4 (pipeline, talent_pool, messaging, core_values, analytics, feedback) and assign them to roles per the spec; then protect the corresponding routes with `@RequirePermission` and scope.

This report reflects the state of the **backend** only; frontend RBAC and UI hiding should be verified in the frontend repository.
