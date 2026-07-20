# Manholes Mapper API

Reference for the real API surface, grounded in `api/` and `vercel.json`.

## Base URL & Routing

```
https://manholes-mapper-three.vercel.app/api
```

Development uses relative paths (the Vite dev server proxies `/api` to production).

Every resource is a **single `index.js` serverless handler** (`api/<resource>/index.js`) — there are no dynamic `[id].js` files. `vercel.json` rewrites RESTful-looking paths onto those handlers:

| Public URL | Rewritten to |
|---|---|
| `/api/users/:id`, `/api/organizations/:id`, `/api/projects/:id`, `/api/sketches/:id` | `/api/<resource>?id=:id` |
| `/api/auth/*`, `/api/layers/*`, `/api/features/*`, `/api/stats/*`, `/api/issue-comments/*` | the resource's `index.js` |
| `/api/notifications/*` | `/api/issue-comments?action=notifications` |

Handlers branch on `req.query.id`, HTTP method, and a body/query `action` field. There are **no** `/lock`, `/unlock`, `/export`, or other sub-path routes.

`/api/health` is the one non-`index.js` handler (`api/health.js`, Edge runtime).

---

## Authentication

Auth is **Better Auth session cookies** — there is no Bearer/JWT scheme. `api/_lib/auth.js` (`verifyAuth()`, lines 166–196) forwards the request headers to `auth.api.getSession()`; the session cookie set at sign-in identifies the user. Send requests with `credentials: 'include'`.

Server config (`lib/auth.js`): Neon Postgres, email/password only, 7-day sessions (`expiresIn`), 5-minute cookie cache, cookies `SameSite=None; Secure` so the Capacitor app (`https://localhost`) can authenticate cross-origin. `trustedOrigins` mirrors the CORS allowlist.

All routes require a session **except** `/api/auth/*` and `/api/health`. Unauthenticated requests get `401 {"error": "Not authenticated"}`.

### `/api/auth/*` — Better Auth catch-all

`api/auth/index.js` wraps the Better Auth handler (`toNodeHandler(auth)`); every `/api/auth/*` path is passed through to Better Auth. The routes used by this app:

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/auth/sign-up/email` | POST | Create account (`{email, password, name}`) |
| `/api/auth/sign-in/email` | POST | Sign in (`{email, password}`) — sets session cookie |
| `/api/auth/sign-out` | POST | Invalidate session |
| `/api/auth/get-session` | GET | Current session + user (this is Better Auth's route name — not `/session`) |

Auth routes are rate-limited at 20 req/min (see below) and are exempt from the app's CSRF check (Better Auth does its own origin validation).

---

## CSRF Protection

Double-submit cookie pattern (`api/_lib/csrf.js`). Every **mutating** request (POST/PUT/DELETE) must carry an `x-csrf-token` header equal to the `csrf_token` cookie. The cookie is deliberately not `httpOnly` (`Path=/; Secure; SameSite=None; Max-Age=604800`) so client JS can read it; `frontend/src/auth/csrf.js` wraps `window.fetch()` to attach the header automatically.

- First mutating call with no cookie: server sets a fresh `csrf_token` cookie and responds `403 {"error": "CSRF token missing. Retry the request."}` — the client retries.
- Header/cookie mismatch: `403 {"error": "CSRF token mismatch"}`.
- GET/HEAD/OPTIONS always pass.

Applies to: **sketches, projects, organizations, users, features, layers, issue-comments** (including the `/api/notifications` rewrite).
Does NOT apply to: **stats, user-role, health, auth**.

---

## Conventions

- **Wrapped envelopes.** Responses wrap the payload in a named key: `{sketches, pagination}`, `{sketch}`, `{projects, orphanCount}`, `{project}`, `{organizations}`, `{organization}`, `{members}`, `{users, pagination}`, `{user}`, `{layers, pagination}`, `{layer}`, `{comments}`, `{comment}`, `{notifications}`, `{leaderboard}`. Exceptions: `/api/user-role`, `/api/health`, and the stats `workload`/`metadata` reports return flat objects; deletes return `{success: true}`.
- **camelCase fields** in responses (DB columns are snake_case and get transformed) — except issue-comments, which return raw DB rows (`sketch_id`, `is_close_action`, …).
- **Request bodies** must be `application/json` (else `415`); max body size **15MB** (else `413`); malformed JSON → `400` (`parseBody()` in `api/_lib/auth.js`).
- **Roles:** `user` (own resources) → `admin` (organization scope) → `super_admin` (everything). "admin+" below means admin or super_admin.
- **Validation limits** (`api/_lib/validators.js`): MAX_NODES=10000, MAX_EDGES=50000, resource IDs must be UUIDs (else `400 Invalid ... ID format`).

---

## Sketches

### GET /api/sketches

Role-filtered list: super_admin sees all, admin sees their organization's, user sees their own.

Query params: `limit` (clamped 1–200, default 50), `offset`, `full=true`.

**Metadata-only by default** — rows carry `nodeCount`/`edgeCount` but no `nodes`/`edges` arrays. Only `?full=true` includes `nodes`, `edges`, `adminConfig`, `snapshotInputFlowConfig`.

```json
{
  "sketches": [
    {
      "id": "…uuid…", "name": "Survey A", "creationDate": "2026-07-01",
      "createdBy": "hussam", "lastEditedBy": "hussam",
      "createdAt": "…", "updatedAt": "…", "version": 12,
      "projectId": "…uuid…",
      "ownerId": "…", "ownerUsername": "hussam", "ownerEmail": "…", "isOwner": true,
      "nodeCount": 42, "edgeCount": 51
    }
  ],
  "pagination": { "limit": 50, "offset": 0, "count": 1 }
}
```

### POST /api/sketches

Create a sketch (`{name, creationDate, nodes, edges, adminConfig, createdBy, lastEditedBy, projectId, snapshotInputFlowConfig}`). If `projectId` is set, the project's `input_flow_config` is snapshotted onto the sketch. → `201 {sketch}`.

**Bulk orphan assignment:** `POST /api/sketches` with body `{"action": "assign-orphans", "projectId": "…uuid…"}` (admin+, project must be in the caller's org) assigns every project-less sketch owned by the caller's organization to that project. → `200 {"assignedCount": n}`.

### GET /api/sketches/:id

Full sketch, role-checked (owner / org admin / super_admin), including a **lock object**:

```json
{
  "sketch": {
    "id": "…", "name": "…", "version": 12,
    "nodes": [ … ], "edges": [ … ],
    "adminConfig": {}, "projectId": "…", "snapshotInputFlowConfig": {},
    "ownerId": "…", "ownerUsername": "…", "ownerEmail": "…", "isOwner": true,
    "lock": {
      "isLocked": false, "lockedBy": null, "lockedAt": null,
      "lockExpiresAt": null, "canEdit": true
    }
  }
}
```

### PUT /api/sketches/:id

Update nodes/edges/metadata. The body may include `clientVersion` and `clientUpdatedAt` for optimistic locking. Success → `200 {sketch}` (with the incremented `version`).

**Two distinct 409 responses:**

1. **Lock conflict** — sketch is locked by another user (checked before and atomically during the update):

```json
{
  "error": "Sketch is locked by another user",
  "lock": { "lockedBy": "…userId…", "lockExpiresAt": "…" }
}
```

2. **Version conflict** — another process updated the sketch since the client last fetched it:

```json
{
  "error": "Sketch was updated by another process. Retry with the current version.",
  "currentSketch": { "id": "…", "version": 13, "nodes": [ … ], "edges": [ … ], … }
}
```

(The `{_conflict: true}` flag seen in app code is added client-side by `frontend/src/auth/sync-service.js`, not by the API.)

### DELETE /api/sketches/:id

Owner-scoped delete. → `200 {"success": true}`.

### POST /api/sketches/:id — lock operations

There are **no** `/lock`/`/unlock` sub-paths. Lock ops are POSTs to the sketch with a body `action` (30-minute expiry, lock columns live on the `sketches` row):

| `action` | Who | Success | Failure |
|---|---|---|---|
| `lock` | anyone with sketch access (re-acquire/expired locks allowed) | `200 {success: true, lock: {…}}` | `409 {error, lock: {lockedBy, lockedAt, lockExpiresAt}}` |
| `unlock` | the lock owner (release is keyed to the caller's userId) | `200 {success, message}` | — |
| `refresh` | the lock owner (extends expiry another 30 min) | `200 {success: true, lockExpiresAt}` | `400 {success: false, message}` |
| `forceUnlock` | admin+ (org admins only within their org) | `200 {success, message}` | `403` / `404` |

Missing/unknown action → `400`.

---

## Projects

### GET /api/projects

Admin+ with no filter sees **all** projects; regular users see their organization's. Optional `?organizationId=` filter (non-admins may only pass their own org).

```json
{ "projects": [ { "id": "…", "organizationId": "…", "name": "…", "description": "…", "inputFlowConfig": {}, "targetKm": 12.5, "sketchCount": 8, "createdAt": "…", "updatedAt": "…" } ], "orphanCount": 3 }
```

`orphanCount` = sketches with no `project_id` in the caller's organization (computed for admins; `0` otherwise).

### POST /api/projects — admin+

`{name (required, ≤200 chars), description, inputFlowConfig, targetKm, organizationId}`. Only super_admin may create in another organization. → `201 {project}`.

### GET /api/projects/:id

Org-checked. → `200 {project}`. Options:

- `?fullSketches=true` — **returns `{sketches, pagination}` instead** (full nodes/edges, for project-canvas mode; `limit` clamped 1–500, default 100).
- `?includeSketches=true` — adds `sketches` (metadata rows) and `sketchPagination` alongside `project` (`sketchLimit` 1–200 default 50, `sketchOffset`).

### PUT /api/projects/:id — admin+ → `{project}`
### DELETE /api/projects/:id — admin+ → `{success: true}`
### POST /api/projects/:id — admin+, body `{"action": "duplicate", "name": "optional"}` → `201 {project}`

---

## Organizations

All org routes require admin+.

| Endpoint | Method | Who | Response |
|---|---|---|---|
| `/api/organizations` | GET | admin+ (super_admin sees all; org admin sees only their own org) | `{organizations: [{id, name, userCount, createdAt}]}` |
| `/api/organizations` | POST | super_admin | `201 {organization}` |
| `/api/organizations/:id` | GET | admin+ (own org unless super_admin) | `{organization: {id, name, createdAt}}` |
| `/api/organizations/:id` | PUT | super_admin | `{organization}` |
| `/api/organizations/:id` | DELETE | super_admin | `{success: true}` |
| `/api/organizations?action=members` | GET | any authenticated user | `{members: [{id, username, email}]}` — the caller's org members, excluding the caller; `[]` when org-less |

There are **no** member add/remove sub-routes — org membership is changed via `PUT /api/users/:id` with `organizationId` (super_admin only).

---

## Users

Admin+ only. There is no `/api/users/me` — use `GET /api/user-role` for the current user.

### GET /api/users

super_admin sees all users; org admin sees their organization's. `limit` clamped 1–200 (default 100), `offset`.

```json
{ "users": [ { "id": "…", "username": "…", "email": "…", "role": "user", "organizationId": "…", "organizationName": "…", "createdAt": "…", "updatedAt": "…" } ], "pagination": { "limit": 100, "offset": 0, "count": 1 } }
```

### GET /api/users/:id → `{user}`

### PUT /api/users/:id → `{user}`

Body: `{role?, organizationId?}`. Rules: only super_admin may assign `admin`/`super_admin`, modify a super_admin, or change `organizationId`; a super_admin cannot demote themself.

---

## Current User: GET /api/user-role

The current user's role, permissions, and effective feature flags. Auto-creates the app-DB user record on first call (and auto-bootstraps an organization for an org-less super_admin). **Flat response, no envelope; no CSRF (GET-only route).**

```json
{
  "userId": "…", "username": "…", "email": "…",
  "role": "admin", "organizationId": "…",
  "isSuperAdmin": false, "isAdmin": true,
  "features": { "export_csv": true, "export_sketch": true, "admin_settings": false, "finish_workday": true, "node_types": true, "edge_types": true },
  "createdAt": "…", "updatedAt": "…"
}
```

---

## Feature Flags

Only two operations exist — there is **no** flag CRUD (flags are the fixed set `export_csv`, `export_sketch`, `admin_settings`, `finish_workday`, `node_types`, `edge_types` = `DEFAULT_FEATURES` in `api/_lib/db.js`).

### GET /api/features/:targetType/:targetId
### PUT /api/features/:targetType/:targetId

`targetType` ∈ `user` | `organization`; `targetId` is the UUID. Admin+ required; org admins only for users in their org; **organization** targets are super_admin-only. PUT body: `{"features": {"export_csv": true, …}}` (keys must be known flags, values boolean).

Both return:

```json
{ "targetType": "user", "targetId": "…uuid…", "features": { "export_csv": true }, "availableFeatures": ["export_csv", "export_sketch", "admin_settings", "finish_workday", "node_types", "edge_types"] }
```

---

## Layers (project GeoJSON reference layers)

### GET /api/layers?projectId=UUID

`projectId` **required** (org-checked). `?full=true` includes `geojson` per layer; `limit` 1–200 default 50.

```json
{ "layers": [ { "id": "…", "projectId": "…", "name": "Sections", "layerType": "geojson", "style": {}, "visible": true, "displayOrder": 0, "createdAt": "…", "updatedAt": "…" } ], "pagination": { "limit": 50, "offset": 0, "count": 1 } }
```

### POST /api/layers — admin+

`{projectId, name (≤200), layerType, geojson (object, required), style?, visible?, displayOrder?}`; `layerType` ∈ `geojson`, `points`, `lines`, `polygons`, `reference`, `overlay`. → `201 {layer}` (without echoing `geojson`).

### GET /api/layers/:id → `{layer}` including full `geojson`
### PUT /api/layers/:id — admin+ → `{layer}`
### DELETE /api/layers/:id — admin+ → `{success: true}`

---

## Issue Comments & Notifications

Issues themselves are **not** an API resource — an "issue" is a client-side node type (`nodeType: "Issue"` inside the sketch JSONB). The API only stores comment threads and notifications for those nodes. Responses here are raw DB rows (snake_case).

### GET /api/issue-comments?sketchId=UUID&nodeId=…

Sketch-access-checked. Also marks the caller's notifications for that issue as read.

```json
{ "comments": [ { "id": "…", "sketch_id": "…", "node_id": "17", "user_id": "…", "username": "hussam", "content": "Fixed", "is_close_action": false, "is_reopen_action": false, "created_at": "…" } ] }
```

### POST /api/issue-comments

`{sketchId, nodeId, content (≤5000 chars), isCloseAction?, isReopenAction?, mentionedUserIds?: [uuid]}` → `201 {comment}`. Creates notifications for thread participants and @mentioned users.

### /api/notifications (rewritten to `/api/issue-comments?action=notifications`)

| Call | Response |
|---|---|
| `GET /api/notifications` | `{notifications: [ {id, sketch_id, node_id, comment_id, type, created_at, comment_content, commenter_username, sketch_name} ]}` (unread, max 50) |
| `GET /api/notifications?count=true` | `{count: n}` |
| `POST /api/notifications` body `{ids: […]}` or `{all: true}` | `{marked: n}` |

---

## Stats

GET-only, no CSRF. Real subpaths are exactly `leaderboard`, `workload`, `metadata` (also reachable as `?type=…`); anything else → `404 {"error": "Not found"}`. There is no `/api/stats/overview` or `/api/stats/project/:id`.

### GET /api/stats/leaderboard[?projectId=UUID]

Accuracy leaderboard aggregated from node data, scoped to the project (org-checked) or the caller's org.

```json
{ "leaderboard": [ { "user": "hussam", "nodeCount": 120, "avgAccuracy": 0.031, "stars": 3 } ] }
```

### GET /api/stats/workload[?projectId=UUID] — admin+

Flat report: `{summary: {totalSketches, totalNodes, totalEdges, totalKm, nodesWithCoords, completionPct, avgAccuracy, targetKm, weekVelocity, prevWeekVelocity, velocityChangePct, weekKm, prevWeekKm, forecastDays}, perUser, daily, perProject, weekly, accuracyDistribution, issueBreakdown, activityHeatmap, records}`.

### GET /api/stats/metadata — admin+

Platform metadata report: `{counts, growth, storage, sizeDistribution, dataQuality, userActivity, featureAdoption, orgBreakdown, orphanedData, locks, engagement}`.

---

## Health

### GET /api/health

Public, **Edge runtime**, never touches the DB, rate-limit exempt.

```json
{ "status": "ok", "timestamp": "2026-07-20T10:00:00.000Z", "region": "fra1", "env": "production" }
```

Note: `/health/` (no `/api`) is a **static HTML diagnostics page** (`frontend/public/health/index.html`), not a JSON endpoint.

---

## Node & Edge JSON

`nodes` and `edges` are stored verbatim as JSONB — the server does not whitelist fields (only counts: ≤10000 nodes, ≤50000 edges). Canonical shapes come from `frontend/src/legacy/graph-crud.js` and `frontend/src/utils/measurement-history.js`.

**Node** (canvas-created, plus survey fields added on measurement):

```json
{
  "id": "17", "x": 412.5, "y": 220.0,
  "nodeType": "Manhole", "type": "type1",
  "note": "", "material": "בטון", "coverDiameter": "",
  "access": 0, "accuracyLevel": 0, "nodeEngineeringStatus": 0, "maintenanceStatus": 0,
  "createdAt": "2026-07-20T08:00:00.000Z", "createdBy": "hussam",
  "gnssFixQuality": 4,
  "surveyX": 187654.321, "surveyY": 654321.987, "surveyZ": 12.345,
  "measure_precision": 0.014, "measure_source": "tsc3",
  "measurements": [
    { "source": "tsc3", "easting": 187654.321, "northing": 654321.987,
      "elevation": 12.345, "precision": 0.014, "precisionV": null,
      "fixQuality": 4, "hdop": null, "satellites": null,
      "measuredAt": "2026-07-20T08:05:00.000Z", "measuredBy": "hussam" }
  ]
}
```

- `measurements[]` is the **append-only field-capture history**: every TSC3/GNSS/import shot appends an entry; capped at 20 keeping the original first shot plus the recent tail; `elevation` is `null` when unmeasured (never `0` — `surveyZ === 0` is the app's "not measured" sentinel); union-merged on sync 409 resolution.
- `measure_source` ∈ `tsc3` | `gnss` | `import` (history entries may also carry `legacy`/`unknown`).
- Depth measurements are **not** node fields.

**Edge** (`tail_measurement` / `head_measurement` — invert depths — live here):

```json
{
  "id": 1752998400000.123, "tail": "17", "head": "18",
  "tail_measurement": "1.85", "head_measurement": "2.10",
  "edge_type": "ביוב", "material": "PVC", "line_diameter": "200",
  "fall_depth": "", "fall_position": "",
  "isDangling": false, "danglingEndpoint": null, "tailPosition": null,
  "maintenanceStatus": 0, "engineeringStatus": 0,
  "direction_source": "user",
  "createdAt": "2026-07-20T08:10:00.000Z", "createdBy": "hussam"
}
```

- `direction_source` ∈ `chronological` | `terrain` | `invert` | `user` — provenance of the tail→head flow arrow (guessed directions get re-checked when depth data arrives; `user`/`invert` are final).
- Admin-configured custom fields are added flat onto both node and edge objects.

---

## Errors

All errors are `{"error": "…"}` — there are no `message` or `code` fields. Some add extras:

| Status | Shape | When |
|---|---|---|
| 400 | `{error}` or `{error: "Validation failed", details: […]}` | bad input / invalid UUID / bad JSON |
| 401 | `{error: "Not authenticated"}` | no/invalid session |
| 403 | `{error}` | role/org denied, CSRF failure |
| 404 | `{error}` | not found (also used to mask cross-org resources) |
| 405 | `{error: "Method not allowed"}` | wrong method |
| 409 | `{error, lock: {…}}` or `{error, currentSketch: {…}}` | sketch lock / version conflict (see Sketches) |
| 413 / 415 | `{error}` | body >15MB / non-JSON Content-Type |
| 429 | `{error: "Too many requests", retryAfter}` | rate limited |
| 500 / 503 | `{error}` | server error (message sanitized to a generic string in production) / DB unavailable |

---

## Rate Limiting

Sliding **60-second window per IP** (`api/_lib/rate-limit.js`), in-memory per warm serverless instance (best-effort — cold instances start fresh).

- Default: **100 requests/min**; `/api/auth/*`: **20 requests/min**; `/api/health`: unlimited.
- Every rate-limited response carries `X-RateLimit-Limit` and `X-RateLimit-Remaining` headers (there is **no** `X-RateLimit-Reset`).
- On 429 a `Retry-After` header (seconds) is set and echoed as `retryAfter` in the body.

---

## CORS

`api/_lib/cors.js`, credentials always allowed (`Access-Control-Allow-Credentials: true`; allowed headers include `x-csrf-token`).

- **Production/deployed:** allowlist only — exact origins from the `ALLOWED_ORIGINS` env var, plus the deployment's own `VERCEL_URL`, the canonical aliases (`manholes-mapper`, `-three`, `-ten` .vercel.app), and Vercel preview-domain patterns. Requests from an unlisted origin get the first allowed origin echoed back (i.e. are effectively blocked by the browser); arbitrary origins are never reflected.
- **Capacitor:** `https://localhost` (the native WebView origin) is always allowed.
- **Local dev** (no allowlist configured): any origin is reflected.

---

## WebSocket Endpoints (TSC3 Survey Mode)

### TSC3 WebSocket bridge (local, not a server endpoint)

TSC3 survey data arrives over a LOCAL WebSocket bridge on port 8765 (Vercel serverless cannot host WebSockets — there is no `/ws/tsc3` server route). Desktop: `ws://localhost:8765` (mock server via `npm run mock:tsc3`); phone on LAN: `ws://<LAN_IP>:8765`; phone via ADB: `adb reverse tcp:8765 tcp:8765` then `ws://localhost:8765`.

**Connection:**

```javascript
const ws = new WebSocket('ws://localhost:8765');
```

**Data format:** CSV lines — `PointName,Easting,Northing,Elevation\n` (ITM coordinates; delimiter and column order auto-detected by `frontend/src/survey/tsc3-parser.js`).

The mock server also exposes an HTTP control API on port 3001 (`GET /api/status`, `POST /api/send-point`, `POST /api/send-batch`, `GET /api/history`, `POST /api/clear-history`).

### Import / Export

There are **no** file import/export API endpoints. CSV export, sketch JSON import/export, and legacy import are all client-side: `frontend/src/utils/csv.js`, `frontend/src/utils/sketch-io.js`, `frontend/src/utils/legacy-import.js`.

---

*Last updated: 2026-07-20 — rewritten against the actual handlers in `api/`.*
