# Milestone 1 – Organization Context + Permissions Foundation

---

## Deliverables

### 1. Current Organization Context

- **Server-side resolution of `currentOrgId`**
  - Loaded from:
    - Authenticated session/JWT
    - Membership table (**NOT** client input)
  - Available in:
    - Route handlers
    - Server actions
    - Service layer

### 2. Permission Model Wired

- **Permission helper** (e.g. `hasPermission`, `requirePermission`)
- **Role → permission resolution** server-side
- No UI logic involved

### 3. Seed Data

- **Canonical permissions** seeded (e.g. `job:create`, `job:publish`)
- **Default roles** seeded (Admin, Recruiter, Viewer)
- **Role–permission mappings** seeded
- Seed is **idempotent** (safe to re-run)

---

## Acceptance Criteria (you can verify)

1. Start app locally.
2. Log in with a user who belongs to 2 orgs.
3. Switching org changes `currentOrgId`.
4. Permissions differ per org.
5. DB contains seeded roles & permissions.

---

## Output you must receive

**PR with:**

- Code
- Migration/seed files
- README section: **“How to test Milestone 1”**

---

## Estimate & cap

| | |
|---|---|
| **Estimate** | 8–10 hours |
| **Cap** | $150 |

---

## How to test Milestone 1

1. **Start app and seed**
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   npm run start:dev
   ```

2. **Log in with a user in 2 orgs**
   - Use seeded user: `user1@example.com` / `dev12345`.
   - `POST /auth/signin` → get JWT.

3. **Current org from server**
   - `GET /orgs` with JWT → response includes `currentOrgId` and list of orgs with `roleKey` (e.g. admin, viewer). No client-sent org id is used for “current org”.

4. **Switching org changes `currentOrgId`**
   - `POST /orgs/1/switch` → then `GET /orgs` → `currentOrgId` is `"1"`.
   - `POST /orgs/2/switch` → then `GET /orgs` → `currentOrgId` is `"2"`.

5. **Permissions differ per org**
   - In Org A (admin): e.g. `POST /jobs` or `POST /jobs/publish` → 201/200.
   - Switch to Org B (viewer): same `POST /jobs` or publish → **403** (missing `job:create` / `job:publish`).

6. **DB contains seeded roles & permissions**
   - Inspect DB: `AccessPermission` has entries (e.g. `job:create`, `job:read`, `job:publish`).
   - `RolePermissionMapping` (or equivalent) links roles (e.g. ORG_ADMIN, RECRUITER, VIEWER) to permissions.
   - Seed is idempotent: run `npm run db:seed` again → no duplicate errors; same state.

7. **Permission available in service layer**
   - A route that requires a permission (e.g. `@RequirePermission('job:read')`) receives auth context in the handler and passes it to the service; the service can use `currentOrgId` and permissions for filtering/logic.
