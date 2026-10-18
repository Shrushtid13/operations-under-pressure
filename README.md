# Operations Under Pressure — Newtonite Engineering System

An operational coordination and work-item management platform engineered for high-concurrency environments, built with Node.js, Fastify, PostgreSQL 16, and React (TanStack Query + Tailwind CSS).

---

## 1. Quickstart & Setup

### Prerequisites
- Node.js >= 22.0.0
- Docker & Docker Compose

### 1. Start PostgreSQL Database
```bash
docker compose up -d db
```
The database will be initialized on `127.0.0.1:5435` with predefined least-privilege roles (`app_migrator`, `app_runtime`, `app_backup`).

### 2. Install Dependencies & Run Migrations
```bash
npm install
npm run migrate
npm run seed
```

### 3. Run Automated Tests
```bash
npm test                      # Full unit, integration, invariant, and security test suite
npm run test:concurrency      # Parallel race-condition tests (concurrent claim, lost-update, idempotency, merge)
```

### 4. Run the Application
In three separate terminal windows (or background jobs):
```bash
# Terminal 1: Fastify REST & WebSocket API Server (port 3000)
npm run dev:api

# Terminal 2: Transactional Outbox Background Worker
npm run dev:worker

# Terminal 3: React SPA Console (port 5173)
npm run dev:web
```
Open **`http://localhost:5173`** in your browser.

---

## 2. Seeded Accounts & Roles

All accounts use the dev password: `Password123!` (or use the one-click demo buttons on the login screen):

| User | Email | Role in Teams (OPS, PAY, ENG) | Notes |
|---|---|---|---|
| **Alice Walker** | `alice@newtonite.test` | **Lead** | Can assign, approve, reject, close, reopen, and manage members |
| **Bob Vance** | `bob@newtonite.test` | **Lead** | Second lead to satisfy separation of duties on sign-offs |
| **Charlie Green** | `charlie@newtonite.test` | **Member** | Can create, claim, edit, release own work, and comment |
| **Dana Scott** | `dana@newtonite.test` | **Viewer** | Read-only visibility in assigned teams; write actions denied (403) |
| **Eve Admin** | `admin@newtonite.test` | **Org Admin** | Read-only visibility across ALL teams; write actions denied unless team member |

---

## 3. Architecture & Core Components

```
                          ┌────────────────────────┐
                          │   React 19 SPA (Vite)  │
                          │ TanStack Query + Cache │
                          └───────────┬────────────┘
                                      │ REST (Idempotency-Key + version)
                                      │ WebSocket (/ws hints)
                                      ▼
               ┌──────────────────────────────────────────────┐
               │         Fastify API (Stateless)              │
               │  Auth, CSRF, JSON Schema validation, Policy  │
               └──────────────────────┬───────────────────────┘
                                      │ One Transaction:
                                      │ UPDATE state + INSERT event +
                                      │ INSERT outbox + STORE idempotency
                                      ▼
               ┌──────────────────────────────────────────────┐
               │           PostgreSQL 16 Primary              │
               │  work_items, work_item_events (append-only), │
               │  idempotency_keys, outbox, sessions          │
               └──────────────────────┬───────────────────────┘
                                      │ FOR UPDATE SKIP LOCKED
                                      ▼
               ┌──────────────────────────────────────────────┐
               │        Background Worker (Outbox)            │
               │  Drains pending rows, deduplicates           │
               │  notifications, handles leases and cleanup   │
               └──────────────────────────────────────────────┘
```

- **API Process (`src/api/server.js`)**: Stateless Fastify service enforcing CSRF protection, session verification, request validation, resource-level authorization, and atomic database mutations. Houses the WebSocket gateway (`/ws`) providing lightweight real-time invalidation hints.
- **Background Worker (`src/worker/worker.js`)**: Polls the transactional outbox using `FOR UPDATE SKIP LOCKED`, generates deduplicated notifications (`UNIQUE (user_id, event_id, kind)`), manages leases and exponential backoff, and cleans up expired keys/sessions.
- **React Console (`web/`)**: High-information-density operations dashboard styled with Tailwind CSS, supporting keyset pagination, attention metric filters, optimistic comments, and draft-preserving conflict resolution.

---

## 4. Critical Behaviors & Guarantees

1. **Race-Condition Free Claims**: Simultaneous claims on open work serialize at PostgreSQL row locks. Exactly one claimant transitions the status to `in_progress`, while concurrent claimants receive `409 ALREADY_ASSIGNED` with the winner's identity.
2. **Lost-Update Prevention**: State-changing writes enforce `expected_version`. Same-field concurrent updates yield `409 VERSION_CONFLICT` with `conflicting_fields`, preserving the user's unsaved draft in the UI.
3. **Disjoint Field-Level Merging**: If two users concurrently edit different fields (e.g. user A changes title and user B changes priority), the server automatically merges the changes and records `merged_from_version` in the audit event.
4. **Idempotent Retries**: Mutating requests require an `Idempotency-Key`. Retries of identical requests replay the committed response verbatim without re-evaluating state, preventing duplicate events or charges. Reusing a key with a different body returns `422 IDEMPOTENCY_KEY_REUSED`.
5. **Separation of Duties**: Items requiring approval must be signed off by a team lead other than the requester (`approval_requested_by <> caller.id`).
6. **Immutable Audit Consistency**: Every state mutation atomically writes an append-only event (`work_item_events`). The database enforces immutability via triggers and role permission restrictions (`app_runtime` cannot UPDATE or DELETE events). The full-history invariant proves zero gaps in timeline versioning.
7. **Resource-Level Authorization**: Non-members receive `404 NOT_FOUND` (no existence leaks); users with insufficient roles receive `403 FORBIDDEN`. All listings are scoped in SQL.

---

## 5. Database Backup & Disaster Recovery

- **Logical Backup:** Run `npm run backup` to generate a timestamped custom-format dump with a SHA-256 checksum in `backups/`.
- **Restore Verification:** Documented in `docs/RESTORE_TEST.md`.

---

## 6. Known Limitations

- **Single Primary Datastore:** Runs against a single primary PostgreSQL instance without automated replication failover (justified for assessment scope; managed PITR recommended for production).
- **Ephemeral WebSocket Hints:** Hints convey only entity identifiers (`{ type: 'item', team_id, item_id, version, event_seq }`). If a client disconnects, missed hints are not replayed; the client refetches current state on reconnect and falls back to periodic polling.
- **Field-Level Merge Window:** Merges are supported within a window of 10 versions (`MERGE_MAX_GAP`). Two users editing different sentences inside the same `description` field still conflict; three-way text merging is out of scope.
- **In-App Notifications Only:** Notifications are delivered within the application and inbox; third-party integrations (Slack/Email) are not built.
- **No Self-Service Password Reset:** Users are pre-seeded; authenticated users can change their password, and team leads manage memberships.
