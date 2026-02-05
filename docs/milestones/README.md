# Milestones

Project deliverables by milestone. Each doc includes scope, acceptance criteria, and how to test.

---

## Index

| Milestone | Doc | Summary |
|-----------|-----|---------|
| **0** | [milestone-0-authorization.md](./milestone-0-authorization.md) | Production auth + session/JWT; membership lookup server-side (no trust in client orgId). |
| **1** | [milestone-1-org-context-permissions.md](./milestone-1-org-context-permissions.md) | Org context + permission model + seed (roles, permissions, mappings). |
| **2a** | [2a-rbac-org-isolation.md](./milestone-2a-rbac-org-isolation) | RBAC + org isolation: scope rules, role→permission mapping, endpoints. |
| **3** | [3-verification.md](./3-verification.md) | Hardening + proof: audit checklist, manual verification, tests. |

---

## Quick reference

- **M0:** Auth provider, JWT/session, server-side membership.
- **M1:** `currentOrgId` from DB, permission helpers, seed (idempotent).
- **M2a:** Scoped access (Admin/Recruiter/Viewer), permission guards, job/app endpoints.
- **M3:** No RBAC in frontend, no trust in client orgId, verification steps.
