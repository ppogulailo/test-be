# Milestone 0 – Authorization (replace “dev auth”)

**Goal:** Real, production-grade authentication + org membership resolution inputs for RBAC.

---

## Deliverables

1. **Auth provider integrated** (BetterAuth / NextAuth / etc.) with:
   - Session/JWT containing `userId`
   - Server-side session validation in Nest (guard/middleware)

2. **Membership lookup endpoint/service:**
   - `userId` → org memberships + roles
   - No trust in client-sent `orgId`

---

## Acceptance

- You can log in/out, session expires, and server rejects unauthenticated calls.
- A user belonging to 2 orgs can be resolved server-side.

---

## Estimate & cap

| | |
|---|---|
| **Estimate** | 8–10 hours |
| **Cap** | $150 |

---

## How to test Milestone 0

1. **Start app and DB**
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   npm run start:dev
   ```

2. **Log in**
   - `POST /auth/signin` with `{"email":"user1@example.com","password":"dev12345"}` (or your test user).
   - Expect 201 with `jwt` and cookies set.

3. **Reject unauthenticated**
   - Call `GET /orgs` or `GET /jobs` without `Authorization: Bearer <jwt>` (and without cookie).
   - Expect **401 Unauthorized**.

4. **Session / expiry**
   - Use an expired or invalid JWT; expect 401 on protected routes.
   - Log out via `GET /auth/logout` (with valid JWT); then call a protected route → 401.

5. **Membership resolved server-side**
   - With a user that belongs to 2 orgs, call `GET /orgs` with valid JWT.
   - Response must include both orgs and roles (e.g. `currentOrgId`, `orgs[]` with `orgId`, `name`, `roleKey`) derived from the DB using `userId` from the JWT, not from client input.
