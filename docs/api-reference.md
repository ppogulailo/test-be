# API Reference

HTTP endpoints, request/response shapes, and auth requirements.

**Base URL:** `http://localhost:4000` (or the value of `PORT`)

**Auth:** Protected routes accept either:

- Cookie: `access_token` (JWT)
- Header: `Authorization: Bearer <JWT>`

**Content-Type:** `application/json` for request bodies.

---

## Auth

Base path: `/auth`

### POST /auth/signup

Register a new user. Issues JWT and sets cookies.

**Auth:** None

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "at-least-8-chars"
}
```

| Field | Type | Validation |
|-------|------|------------|
| email | string | Valid email |
| password | string | Min 8 characters |

**Response:** `201`

```json
{
  "jwt": "<access-token>",
  "id": 1
}
```

Cookies set: `access_token`, `refresh_token` (httpOnly, sameSite: lax).

**Errors:** `409` if email already exists; `400` on validation failure.

---

### POST /auth/signin

Sign in with email and password. Issues JWT and sets cookies.

**Auth:** None

**Request body:**

```json
{
  "email": "user@example.com",
  "password": "password"
}
```

| Field | Type |
|-------|------|
| email | string (email) |
| password | string (non-empty) |

**Response:** `201`

```json
{
  "jwt": "<access-token>",
  "id": 1
}
```

Cookies set: `access_token`, `refresh_token`.

**Errors:** `401` invalid email or password; `400` validation.

---

### GET /auth/me

Return the current user (id, email, role).

**Auth:** Required (JWT)

**Response:** `200`

```json
{
  "id": 1,
  "email": "user@example.com",
  "role": "client"
}
```

`role` is `"client"` for `UserType.TEAM_MEMBER`, `"candidate"` for `UserType.CANDIDATE`.

**Errors:** `401` if not authenticated.

---

### GET /auth/logout

Clear auth cookies. Does not invalidate the JWT server-side; client should stop sending it.

**Auth:** Required (JWT)

**Response:** `200`

```json
{
  "ok": true
}
```

Cookies cleared: `access_token`, `refresh_token`.

---

### GET /auth/refresh

Issue a new access token using the refresh token cookie. Sets new `access_token` cookie.

**Auth:** None (uses cookie `refresh_token`)

**Response:** `200`

```json
{
  "jwt": "<new-access-token>"
}
```

**Errors:** `403` if refresh token missing, invalid, or expired.

---

## Organizations

Base path: `/orgs`

All org endpoints require JWT and org context. Current org and list are resolved server-side from the user’s memberships and `UserCurrentOrg`; **no client-sent org id is trusted** for “current org”.

---

### GET /orgs

List organizations the user belongs to and the current org id.

**Auth:** Required (JWT). Org context is resolved from JWT + DB.

**Response:** `200`

```json
{
  "currentOrgId": "1",
  "orgs": [
    {
      "orgId": "1",
      "name": "Org A",
      "isCurrent": true,
      "roleKey": "admin"
    },
    {
      "orgId": "2",
      "name": "Org B",
      "isCurrent": false,
      "roleKey": "viewer"
    }
  ]
}
```

- `currentOrgId`: Id of the current org (from `UserCurrentOrg` or first membership).
- `orgs`: All active memberships; `roleKey` is the org-level role (e.g. admin, recruiter, viewer).

**Errors:** `401` not authenticated; `403` no active membership.

---

### POST /orgs/:orgId/switch

Set the current organization for the user. Validates that the user is a member of the given org.

**Auth:** Required (JWT)

**Params:**

| Param | Type | Description |
|-------|------|-------------|
| orgId | number | Organization (company) id to switch to |

**Response:** `200`

Returns the new auth context (e.g. current org, role, permissions). Exact shape is implementation-specific; typically includes `currentOrgId`, `roleKey`, `permissions`.

**Errors:** `401` not authenticated; `403` not a member of the org; `404` org not found for user.

---

## Jobs

Base path: `/jobs`

All job endpoints require JWT, org context, and the specified permission(s). Current org is used for permission resolution.

---

### POST /jobs

Create a job (stub). Used to demonstrate permission `job:create`.

**Auth:** Required (JWT + org context)

**Permission:** `job:create`

**Response:** `201`

```json
{
  "ok": true,
  "orgId": "1"
}
```

**Errors:** `401` not authenticated; `403` no org context or missing `job:create`.

---

### GET /jobs

List jobs for the current org only (org-scoped).

**Auth:** Required (JWT + org context). **Permission:** `job:read`

**Response:** `200` — array of jobs (id, title, status, companyId, createdAt, updatedAt).

**Errors:** `401` not authenticated; `403` no org context or missing `job:read`.

---

### GET /jobs/:id

Get one job. **403** if the job belongs to another org.

**Auth:** Required. **Permission:** `job:read`

**Errors:** `403` wrong org; `404` not found.

---

### POST /jobs

Create a job in the current org. **Permission:** `job:create`

**Request body:** See CreateJobDto (title, experience, employmentType, workArrangement, responsibilities, requirements, niceToHave, perks, whoYouAre, tags; optional education, location).

**Response:** `201` — created job (id, title, status, companyId, createdAt).

**Errors:** `403` missing permission; `400` validation.

---

### POST /jobs/publish

Publish a job by id. Requires `job:publish`. **403** if job is in another org.

**Auth:** Required (JWT + org context)

**Permission:** `job:publish`

**Request body:**

```json
{
  "jobId": 1
}
```

**Response:** `200` — updated job (id, title, status, companyId, updatedAt).

**Errors:** `401` not authenticated; `403` no org context, missing `job:publish`, or job in another org; `404` job not found.

---

### POST /jobs/:id/publish

Same as POST /jobs/publish but job id in path. **Permission:** `job:publish`

---

## Applications (pipeline)

Base path: `/applications`

All application endpoints require JWT, org context, and the specified permission(s). Queries are scoped by current org; no cross-org data is returned.

---

### GET /applications

List applications for the current org (pipeline). Optional filter by job.

**Auth:** Required (JWT + org context). **Permission:** `job:read`

**Query:**

| Param  | Type   | Description        |
|--------|--------|--------------------|
| jobId  | number | Optional. Filter by job id. |

**Response:** `200`

Array of applications (id, jobId, candidateProfileId, companyId, status, submittedAt, updatedAt). Only applications for the current org are returned.

**Errors:** `401` not authenticated; `403` no org context or missing `job:read`.

---

## Error responses

- **400 Bad Request:** Validation failed (e.g. invalid email, short password). Body may include validation details.
- **401 Unauthorized:** Missing or invalid JWT (e.g. expired, wrong secret).
- **403 Forbidden:** Authenticated but not allowed (e.g. no org membership, missing permission).
- **404 Not Found:** Resource not found (e.g. org not found for user).
- **409 Conflict:** Business conflict (e.g. email already registered).

---

## Example: full flow (curl)

```bash
# 1. Sign in (use seeded user after npm run db:seed)
curl -s -X POST "http://localhost:4000/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.com","password":"dev12345"}' \
  -c cookies.txt

# Extract JWT from response (e.g. with jq) and set TOKEN
TOKEN="<paste-jwt-here>"

# 2. List orgs (current org + list)
curl -s "http://localhost:4000/orgs" \
  -H "Authorization: Bearer $TOKEN"

# 3. Switch to Org B (use orgId from step 2)
curl -s -X POST "http://localhost:4000/orgs/2/switch" \
  -H "Authorization: Bearer $TOKEN"

# 4. POST /jobs/publish (200 in Org A as admin, 403 in Org B as viewer)
curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:4000/jobs/publish" \
  -H "Authorization: Bearer $TOKEN"
```

With cookies (browser or curl `-b cookies.txt`):

```bash
curl -s -X POST "http://localhost:4000/auth/signin" \
  -H "Content-Type: application/json" \
  -d '{"email":"user1@example.com","password":"dev12345"}' \
  -c cookies.txt

curl -s "http://localhost:4000/orgs" -b cookies.txt
```
