# Milestone 2A Demo Script (Frontend + Backend proof)

Use this as your **live demo checklist** to show that RBAC is enforced server-side and mirrored in the UI.

## 0) Prerequisites (5 min before demo)

- Backend running at `http://localhost:4000`
- Frontend running at `http://localhost:3000`
- Database migrated + seeded

Backend quick commands (run once):

```bash
cd FER/backend-fer
npx prisma migrate deploy
npx prisma generate
npm run db:seed
npm run start:dev
```

Frontend quick commands (run once):

```bash
cd "FER/fellor-frond-end 2"
npm run dev
```

## 1) What you will prove (talk track)

- **RBAC is enforced by the API** (403 when permission missing).
- **Org isolation is enforced server-side** (switch org → permissions/scope change).
- **Frontend mirrors RBAC** (sidebar/routes hide or show based on permissions).
- **Subscription plan gates are separate from RBAC** (feature hidden even if user has permission).

## 2) Demo #1 — Backend enforcement proof from the frontend (recommended)

This page exists specifically to demonstrate allow/deny and org switching:

- Open: `http://localhost:3000/client/backend-rbac-test`

### Steps

1) **Show current org + org list**
   - Explain: backend reads org context server-side (no client-trusted orgId).

2) **Switch org**
   - Click “Switch” for the other org.
   - Explain: permissions/scope are re-resolved based on the new org membership.

3) **Call a protected endpoint**
   - Click the test button for the protected write.
   - Expected:
     - In the org where your user has permission → **200**
     - In the org where your user lacks permission → **403**

### What this proves

- **requirePermission(...)** works (403 on missing permission)
- **org isolation** works (same user, different org context → different allow/deny)

## 3) Demo #2 — Frontend UI gating (sidebar + route access)

Open the client area:

- `http://localhost:3000/client/dashboard`



### Steps

1) **Show the sidebar**
   - Some items should be hidden if the current member lacks permission.
   - Explain: UI hides, but backend still enforces (Demo #1).

2) **Open a restricted route**
   - Try navigating directly to a route you don’t have access to.
   - Expected: “You don’t have access to this section” message.

### What this proves

- FE gating mirrors BE RBAC for pages/actions (but is not the source of truth).

## 4) Demo #3 — Plan gates (Subscription ≠ RBAC)

In the client UI, these are plan-gated:

- **Analytics**: `/client/analytics-insights` (feature key: `advanced_analytics`)
- **Team Access Management**: `/client/settings/team-access-management` (feature key: `team_access_management`)

### How the plan is determined in this project

Frontend reads the Better Auth **Organization.metadata** field.
Supported values:

- `"BASIC"` → gated features hidden
- `"PRO"` / `"CORPORATE"` → gated features available

### Quick way to set plan tier (DB)

In the **frontend database**, update `organization.metadata` to `"PRO"` or `"BASIC"`.
This table is from the frontend Prisma schema (`FER/fellor-frond-end 2/prisma/schema.prisma`).

Example SQL (adjust DB name/connection as needed):

```sql
UPDATE "organization" SET "metadata" = 'PRO' WHERE "id" = '<ORG_ID>';
```

Then refresh the browser.

### What to show

1) With BASIC: Analytics and Team Access Management are hidden/blocked.
2) With PRO: those sections appear.

## 5) Demo #4 — Job approval flow + audit fields (API)

This proves the non-negotiable audit contract:

- `approvedById`, `approvedAt` are written on approval

### Recommended: Swagger UI

- Open Swagger: `http://localhost:4000/api`
- Authorize with JWT (from browser cookie `backend_access_token`, or your login response).

### Endpoints to demo

1) Recruiter requests approval:
   - `POST /jobs/:id/request-approval`
2) HM/Admin approves:
   - `POST /jobs/:id/approve`
3) HM/Admin rejects:
   - `POST /jobs/:id/reject` (include a reason)

### What to say

- Recruiter can **request** approval only (cannot approve/reject).
- HM/Admin can approve/reject and the job records **who** and **when**.

## 6) Optional Demo — Reviewer magic link (token-based, 24h)

If the client asks “how does reviewer access work?”:

### Create a reviewer session (RBAC protected)

- `POST /reviewer-sessions` with body `{ "jobId": <jobId> }`
- Response includes a **token** and expiry.

### Use token-only endpoints (no org membership)

Send `Authorization: Bearer <token>`:

- `GET /reviewer/session`
- `GET /reviewer/jobs/:jobId/applications`
- `POST /reviewer/jobs/:jobId/feedback`

### What to emphasize

- Reviewer session is **job-scoped** and **expires in 24h**
- Reviewer cannot list org jobs, cannot access settings/analytics, cannot access other jobs/candidates

## 7) If something fails during the demo (fast fixes)

- If `/client/backend-rbac-test` says “No backend session”:
  - Log in via the Nest auth flow so the `backend_access_token` cookie exists.
- If migrations fail:
  - Ensure Postgres is running and `FER/backend-fer/.env` has the right `DATABASE_URL`.

