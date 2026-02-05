<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Documentation

Backend documentation lives in the **[docs/](./docs/)** folder:

- **[docs/README.md](./docs/README.md)** — Overview and quick start
- **[docs/setup.md](./docs/setup.md)** — Environment, database, migrations, seed
- **[docs/architecture.md](./docs/architecture.md)** — App structure, auth flow, org context, RBAC
- **[docs/api-reference.md](./docs/api-reference.md)** — HTTP endpoints, request/response, auth
- **Swagger UI** — When the app is running, open **http://localhost:4000/api** for interactive API docs (try endpoints, send JWT via Authorize).
- **[docs/RLS_AND_DB_CONTEXT.md](./docs/RLS_AND_DB_CONTEXT.md)** — Milestone 2B: how RLS context is set, which tables are protected, two-role workflow, verification script.
- **[docs/MILESTONE_2A_ACCEPTANCE.md](./docs/MILESTONE_2A_ACCEPTANCE.md)** — Milestone 2A: scope rules (Recruiter = own/assigned; HM/Admin = org-wide), role→permission mapping, endpoints covered, how to verify.
- **[docs/HOW_RBAC_WORKS.md](./docs/HOW_RBAC_WORKS.md)** — How RBAC works, where to add permissions, how to protect a new endpoint (1–2 pages).
- **[docs/MILESTONE_3_VERIFICATION.md](./docs/MILESTONE_3_VERIFICATION.md)** — Milestone 3: audit check, verification checklist, reproduce deny/allow in &lt;10 min.

## Project setup

```bash
$ yarn install
```

## Milestone 0 & 1 – Where it lives and what to check

- **Milestone 0 (Authorization)** and **Milestone 1 (Organization Context + Permissions)** are implemented in the **Nest backend**, not in the Next.js frontend UI.
- **Backend**: JWT auth, `JwtAuthGuard`, `OrgContextService` (userId → org memberships + roles, `currentOrgId` from `UserCurrentOrg`/membership table, no trust in client-sent orgId), `hasPermission` / `@RequirePermission`, seed (permissions, role-permission mappings, default roles, idempotent).
- **Frontend**: Login/logout and session (Better Auth + backend JWT mirror) work on the frontend. **Org list and org switching in the app use Better Auth’s organization plugin** (`authClient.organization.list()`, `setActive()`), not the Nest `/orgs` API. So “switch org” in the UI does not call the backend `/orgs/:id/switch`; the backend org context is for **Nest API consumers** (e.g. direct calls to `/orgs`, `/jobs/publish` with JWT).

**Where to check**

| What to verify | Where |
|----------------|--------|
| Log in / log out, session expires | **Frontend**: `/auth/log-in`, `/auth/sign-up`, then visit `/candidate/dashboard` or `/client/dashboard`; logout via sidebar. |
| Server rejects unauthenticated calls | **Backend**: `curl` to `/orgs` or `/jobs/publish` without `Authorization: Bearer <token>` → 401. |
| User in 2 orgs resolved server-side | **Backend**: Follow “How to test Milestone 1” below (seed user `user1@example.com` is in Org A and Org B). |
| Switching org changes currentOrgId; permissions differ per org | **Backend**: Same section – call `GET /orgs`, then `POST /orgs/<ORG_B_ID>/switch`, then `POST /jobs/publish` → 403 in Org B (viewer). |
| Seeded roles & permissions in DB | **Backend**: After `npm run db:seed`, inspect `access_permissions`, `role_permission_mappings`, `membership_roles`, `user_current_org`. |

---

## How to test as client on the frontend

The client area (`/client/*`) requires `session.user.role === "client"`. Right now that role comes from **Better Auth**; backend (Nest) `/auth/me` returns `role: "candidate"` for all users, so **Nest-only login** will always send you to the candidate dashboard if you open a client URL.

### Option A – Better Auth (client role + org switching in the UI)

1. **Get a client user (Better Auth)**  
   - Sign up with **Better Auth** (e.g. email/password or OAuth) and choose **client** at sign-up, **or**  
   - Use the **accept-invitation** flow: open an invite link as a new user and accept; that creates a client user and sends you to `/client/dashboard`.

2. **Open the client app**  
   - Go to **`/client/dashboard`** (or `/auth/log-in?role=client` then log in with a client user).  
   - You should land on the client dashboard.

3. **Check org list and “current org”**  
   - Go to **Settings** (sidebar) → **Team Access Management** (or **Company details** / org-related settings).  
   - The invite flow uses `authClient.organization.list()` and `authClient.organization.setActive()` (Better Auth).  
   - If the user is in multiple orgs, you can see/switch the active org there (e.g. when inviting, the first org is set active).

4. **Permissions in the client UI**  
   - Client layout uses `usePermissions()` and `getCurrentMemberPermissions()` (Better Auth org member + overrides).  
   - Different roles (admin / recruiter / viewer) show or hide quick actions and pages; try a **viewer**-like member to see restricted UI.

### Option B – Backend (Nest) login only

- If you **only** sign in via the **Nest** login form (no Better Auth session), the backend returns `role: "candidate"`.  
- Visiting **`/client/dashboard`** will redirect you to **`/candidate/dashboard`** because `RequireRole role="client"` fails.  
- So **client dashboard and org switching in the UI cannot be tested with Nest-only login** until the backend exposes a client role (e.g. stored on User and returned from `/auth/me`).

### Quick checklist (client on frontend)

| Step | Action |
|------|--------|
| 1 | Have a **Better Auth** user with role **client** (sign-up with role=client or accept org invitation). |
| 2 | Open **`/auth/log-in?role=client`** or go directly to **`/client/dashboard`** after logging in. |
| 3 | Confirm you stay on **`/client/dashboard`** (summary cards, hiring insights, etc.). |
| 4 | Go to **Settings → Team Access Management** and confirm org list / invite / set active org work. |
| 5 | (Optional) Use a user with limited role (e.g. viewer) and confirm some actions are hidden. |

---

## How to test Milestone 0 & 1 from the client side

You can demonstrate and verify RBAC **as much as possible from the browser** using the frontend app and a dedicated test page.

### Prerequisites

- Backend and frontend both running (e.g. backend on port 4000, frontend on 3000).
- Backend DB migrated and seeded: `cd backend && npm run db:seed` (creates user1@example.com in Org A and Org B).

### Milestone 0 – Authorization

1. **Log in** – Open `http://localhost:3000/auth/log-in`, sign in with **user1@example.com** / **dev12345**. You should land on the client dashboard (session/JWT with userId).
2. **Log out** – Click Logout in the sidebar; visiting `/client/dashboard` again should redirect to login (session cleared).
3. **Server rejects unauthenticated** – In DevTools Console: `fetch('http://localhost:4000/orgs').then(r => console.log(r.status))` → expect **401** when not logged in.
4. **User in 2 orgs resolved server-side** – Use the Backend RBAC test page (below); it calls GET /orgs and shows current org + 2 orgs for the seeded user.

### Milestone 1 – Organization Context + Permissions

1. **Start app and log in** – Same as above (user1@example.com / dev).
2. **Open Backend RBAC test page** – In the app: **Settings** → **Backend RBAC test (M0 & M1)**, or open **http://localhost:3000/client/backend-rbac-test**. The page calls the Nest backend GET /orgs using your backend session (cookie). If testing backend-only, use curl with JWT from signin or dev-login (see “How to test Milestone 1” below).
3. **Verify current org and list** – You should see **Current org ID** and a list of **2 orgs** (Org A, Org B). No “No backend session” = currentOrgId is loaded from session/membership table, not client input.
4. **Switch org** – Click **Switch here** for the other org (e.g. Org B). The page refetches; **Current org ID** and the list should update (switching org changes currentOrgId).
5. **Permissions differ per org** – With **Org A** (Admin): click **Call POST /jobs/publish** → expect **200**. Switch to **Org B** (Viewer), click again → expect **403** (permissions differ per org).
6. **DB seeded** – Seed creates permissions (e.g. job:create, job:publish), default roles (Admin, Recruiter, Viewer), role-permission mappings, and the dev user in 2 orgs. Optional: inspect `access_permissions`, `role_permission_mappings`, `membership_roles`, `user_current_org` in the backend DB.

### Optional: Same JWT from curl

1. Log in on the frontend, then DevTools → Application → Cookies → localhost:3000 → copy **backend_access_token** value.
2. In terminal: `export TOKEN="<paste>"`, then:
   - `curl -s "http://localhost:4000/orgs" -H "Authorization: Bearer $TOKEN"`
   - `curl -s -X POST "http://localhost:4000/orgs/<ORG_B_ID>/switch" -H "Authorization: Bearer $TOKEN"`
   - `curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:4000/jobs/publish" -H "Authorization: Bearer $TOKEN"` (200 in Org A, 403 in Org B).

---

## How to test Milestone 1 (Organization Context + Permissions Foundation)

### Prerequisites

- **Env vars**:
  - **`DATABASE_URL`**: Postgres connection string (e.g. `postgresql://postgres:postgres@localhost:5432/deveteria?schema=public`)
  - **`JWT_SECRET`**: any non-empty string
- **Postgres** running and reachable at `DATABASE_URL`

### Setup database + seed

```bash
# install deps
npm install

# reset + apply migrations (wipes local DB)
npx prisma migrate reset

# seed (idempotent; safe to re-run)
npm run db:seed
```

### Start the API

```bash
npm run start:dev
```

### Get a DEV JWT

(Use the port your backend runs on, e.g. `4000` if `npm run start:dev` listens on 4000.)

```bash
curl -s -X POST "http://localhost:4000/auth/dev-login" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.com"}'
```

Copy `accessToken` (or `jwt`) from the response; use it as `TOKEN` below.

### Verify org context + permissions

```bash
# list orgs, see current org + role per org
curl -s "http://localhost:4000/orgs" \
  -H "Authorization: Bearer $TOKEN"
```

Expected:
- user is **admin** in **Org A** (current)
- user is **viewer** in **Org B**

```bash
# Create a job first, then publish it (admin has job:publish)
curl -s -X POST "http://localhost:4000/jobs" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","experience":"MID","employmentType":"LONG_TERM","workArrangement":"REMOTE","responsibilities":[],"requirements":[],"niceToHave":[],"perks":[],"whoYouAre":[],"tags":[]}'
# Note the returned job id (e.g. 1), then:
curl -i -X POST "http://localhost:4000/jobs/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId":1}'
# Expect 200 in Org A.
```

Now switch to Org B (grab Org B id from `/orgs` response):

```bash
curl -s -X POST "http://localhost:4000/orgs/<ORG_B_ID>/switch" \
  -H "Authorization: Bearer $TOKEN"
```

```bash
# 403 in Org B (viewer does NOT have job:publish)
curl -i -X POST "http://localhost:4000/jobs/publish" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"jobId":1}'
# Expect 403.
```

## Compile and run the project

```bash
# development
$ yarn run start

# watch mode
$ yarn run start:dev

# production mode
$ yarn run start:prod
```

## Run tests

```bash
# unit tests
$ yarn run test

# e2e tests
$ yarn run test:e2e

# test coverage
$ yarn run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ yarn install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
# backend-fer
