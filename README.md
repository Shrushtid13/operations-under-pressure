# Operations Under Pressure — Newtonite Engineering System

An operational coordination and work-item management platform engineered for high-concurrency environments, built with Node.js, Fastify, PostgreSQL 16, and React (TanStack Query + Tailwind CSS).

> 📖 **Architectural Guides**:
> - [ENGINEERING_DECISIONS.md](ENGINEERING_DECISIONS.md) — 5 core engineering decisions, concurrency models, and sync vs async trade-offs.
> - [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Exhaustive system architecture, CQRS, PDP/PEP authorization, and verification guide.
> - [src/README.md](src/README.md) — Backend services and Fastify API directory guide.
> - [web/src/components/README.md](web/src/components/README.md) — Frontend React 19 component catalog and screen mappings.

---

## 🚀 Live Demo

**Live Application:** [Operations Under Pressure](https://operations-under-pressure-eight.vercel.app/)

Explore the deployed application to experience the operational work management interface, including work-item coordination and team workflows.

> Note: The live frontend may depend on backend and database services being configured and available in the deployed environment.


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

## 4. Codebase Directory Map for Reviewers

Detailed layer-by-layer architectural documentation is available in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [src/README.md](src/README.md), and [web/src/components/README.md](web/src/components/README.md).

```
d:\operations\
├── README.md                          # Primary setup, test instructions, and reviewer guide
├── package.json                       # Dependencies, scripts, and runtime engine (Node >=22)
├── docker-compose.yml                 # PostgreSQL 16 container definition
├── ENGINEERING_DECISIONS.md           # Architecture Decision Records (ADRs)
│
├── docs/                              # Architecture & Operations Documentation
│   ├── ARCHITECTURE.md                # Full system architecture, CQRS, PDP/PEP, OCC & reviewer guide
│   └── RESTORE_TEST.md                # Disaster recovery backup restoration verification
│
├── src/                               # Backend Source Code (Fastify + PostgreSQL)
│   ├── README.md                      # Backend layer architecture guide
│   ├── api/                           # REST & WebSocket API Gateway
│   │   ├── server.js                  # Fastify server bootstrap, plugins, security headers, error handler
│   │   ├── websocket.js               # Real-time WebSocket connection gateway & PG pub/sub bridge
│   │   ├── hooks/                     # Security Hooks & Middleware
│   │   │   ├── authHook.js            # HttpOnly session cookie verification, sets req.user
│   │   │   └── csrfHook.js            # CSRF mitigation (Origin/Host checks & X-Requested-By)
│   │   └── routes/                    # Route Controllers with Ajv JSON Schema Validation
│   │       ├── authRoutes.js          # Authentication (Argon2id), session management, password updates
│   │       ├── workItemRoutes.js      # Work items: claims, multi-assignees, approvals, attachments
│   │       ├── workspaceRoutes.js     # Multi-tenant workspaces & invitation management
│   │       ├── teamRoutes.js          # Team membership, chat messaging, and on-call schedules
│   │       ├── overviewRoutes.js      # Executive SLA health counters & attention metrics
│   │       └── notificationRoutes.js  # User notifications inbox & unread counts
│   │
│   ├── services/                      # Domain Business Logic (CQRS + Security PDP)
│   │   ├── policy.js                  # Policy Decision Point (PDP): RBAC, 403 Forbidden rules, SoD
│   │   ├── commands.js                # Command Service (Write Pipeline): ACID transactions, OCC, outbox
│   │   ├── queries.js                 # Query Service (Read Pipeline): Filtered views, keyset pagination
│   │   ├── reminderService.js         # Proactive deadline monitors (24h approaching & overdue alerts)
│   │   ├── workspaceService.js        # Multi-tenant workspace creation and invite acceptance logic
│   │   └── authService.js             # Password hashing (Argon2id) and crypto session tokens
│   │
│   ├── worker/                        # Asynchronous Background Daemon
│   │   └── worker.js                  # Transactional Outbox processor & deadline reminder scheduler
│   │
│   ├── db/                            # Datastore Connection & Migrations
│   │   ├── pool.js                    # Least-privilege PostgreSQL connection pools
│   │   ├── migrator.js                # Database schema migration runner
│   │   ├── seed.js                    # Seed data with deterministic demo teams and users
│   │   └── migrations/                # Immutable, sequential SQL migrations (001 - 011)
│   │       ├── 001_core_schema.sql
│   │       ├── 002_indexes_and_triggers.sql
│   │       ├── 003_grants.sql
│   │       ├── ...
│   │       └── 011_multiple_assignees_and_approvals.sql
│   │
│   └── shared/                        # Shared Cross-Cutting Utilities
│       ├── config.js                  # Environment configuration and validation
│       ├── errors.js                  # Typed domain error hierarchy (AppError, ConflictError, etc.)
│       └── logger.js                  # Pino structured JSON logging
│
├── web/                               # Frontend Single-Page Application (React 19 + Vite + Tailwind)
│   ├── index.html                     # HTML root template
│   ├── vite.config.js                 # Vite bundler configuration & API proxy
│   └── src/
│       ├── main.jsx                   # React root entry point
│       ├── App.jsx                    # Root routing, global state, layout orchestration
│       ├── api.js                     # Unified REST API client (Idempotency-Key & CSRF headers)
│       ├── useWebSocket.js            # Real-time WebSocket hook with TanStack cache invalidation
│       ├── index.css                  # Tailwind CSS design system
│       └── components/                # UI Component Architecture
│           ├── README.md              # Frontend component catalog and screen mapping
│           ├── index.js               # Component barrel export
│           │
│           ├── Views/Screens:
│           │   ├── HomePage.jsx       # Public landing page with three guarantees & sign-in modal
│           │   ├── OverviewView.jsx   # Operations overview dashboard & high-priority jobs
│           │   ├── WorkListView.jsx   # Keyset-paginated work item tables (All Work / My Work)
│           │   ├── WorkItemDetail.jsx # Work item deep dive, multi-assignees, approvals, timeline
│           │   ├── TeamMembersView.jsx# Team member directory and workspace invitation generator
│           │   ├── TeamChatView.jsx   # Real-time operational communications channel
│           │   ├── OnCallView.jsx     # On-call shift schedules and war room incident coordination
│           │   ├── InboxView.jsx      # User notifications center (assignments, mentions, deadlines)
│           │   ├── AccountView.jsx    # Profile details and password change settings
│           │   ├── LoginView.jsx      # Authentication and registration with one-click demo logins
│           │   └── WorkspaceOnboardingView.jsx # Multi-tenant workspace creation and invite acceptance
│           │
│           ├── Modals/Dialogs:
│           │   ├── CreateItemModal.jsx# Work item creation with deadline presets & priority
│           │   ├── EditItemModal.jsx  # Edit modal with client-side draft preservation
│           │   └── ConflictModal.jsx  # OCC 409 version conflict prompt ("Take theirs" vs "Overwrite")
│           │
│           ├── Layout/Navigation:
│           │   ├── Sidebar.jsx        # Navigation drawer, workspace switcher, and team selector
│           │   ├── Header.jsx         # Global search bar, new item CTA, and live connection status
│           │   ├── WorkItemRow.jsx    # Dense job row featuring overlapping multi-assignee avatars
│           │   ├── NotificationsPopover.jsx # Header notification bell dropdown menu
│           │   └── NotificationToaster.jsx  # Floating real-time collaborator and deadline toasts
│           │
│           └── legacy/                # Archived prototype stubs (superseded by active components)
│               └── README.md          # Archival mapping of prototype stubs to active replacements
│
├── test/                              # Automated Test Suite (Vitest)
│   ├── api.test.js                    # End-to-end integration, security, audit invariants, multi-assignees
│   ├── concurrency.test.js            # Parallel race conditions (claims, lost-updates, idempotency)
│   ├── deadlines.test.js              # Work item deadlines, automated reminder notifications
│   ├── workspaces.test.js             # Multi-tenant workspace isolation & invite tokens
│   └── testHelper.js                  # Shared test fixtures, auth tokens, database resets
│
├── scripts/                           # Operations & Maintenance Scripts
│   ├── backup.js                      # Timestamped logical backup generator with SHA-256
│   └── scan-frontend-leaks.js         # Security scanner for token/credential leaks in frontend
│
└── backups/                           # Logical SQL dumps & disaster recovery verification
```

---

## 5. Critical Behaviors & Guarantees

1. **Race-Condition Free Claims**: Simultaneous claims on open work serialize at PostgreSQL row locks. Exactly one claimant transitions the status to `in_progress`, while concurrent claimants receive `409 ALREADY_ASSIGNED` with the winner's identity.
2. **Lost-Update Prevention**: State-changing writes enforce `expected_version`. Same-field concurrent updates yield `409 VERSION_CONFLICT` with `conflicting_fields`, preserving the user's unsaved draft in the UI.
3. **Disjoint Field-Level Merging**: If two users concurrently edit different fields (e.g. user A changes title and user B changes priority), the server automatically merges the changes and records `merged_from_version` in the audit event.
4. **Idempotent Retries**: Mutating requests require an `Idempotency-Key`. Retries of identical requests replay the committed response verbatim without re-evaluating state, preventing duplicate events or charges. Reusing a key with a different body returns `422 IDEMPOTENCY_KEY_REUSED`.
5. **Separation of Duties**: Items requiring approval must be signed off by a team lead other than the requester (`approval_requested_by <> caller.id`).
6. **Immutable Audit Consistency**: Every state mutation atomically writes an append-only event (`work_item_events`). The database enforces immutability via triggers and role permission restrictions (`app_runtime` cannot UPDATE or DELETE events). The full-history invariant proves zero gaps in timeline versioning.
7. **Resource-Level Authorization**: Non-members receive `404 NOT_FOUND` (no existence leaks); users with insufficient roles receive `403 FORBIDDEN`. All listings are scoped in SQL.
8. **Multi-Assignee Collaboration & Assignee-Only Resolution**: Work items support multiple concurrent assignees via `work_item_assignees`. Any assignee can submit fixes for approval. Lead approval returns the item to `in_progress` (`fix_approved = true`). The `resolve` action is restricted strictly to active assignees (leads receive `403 FORBIDDEN`). Real-time collaborator updates trigger floating on-screen alerts.
9. **Deadlines & Automated Reminders**: Items support custom or preset deadlines (`due_at`). The background outbox worker monitors approaching (within 24h) and overdue deadlines, dispatches deduplicated alerts, and automatically marks them read upon resolution.

---

## 6. Database Backup & Disaster Recovery

- **Logical Backup:** Run `npm run backup` to generate a timestamped custom-format dump with a SHA-256 checksum in `backups/`.
- **Restore Verification:** Documented in `docs/RESTORE_TEST.md`.

---

## 7. Known Limitations

- **Single Primary Datastore:** Runs against a single primary PostgreSQL instance without automated replication failover (justified for assessment scope; managed PITR recommended for production).
- **Ephemeral WebSocket Hints:** Hints convey only entity identifiers (`{ type: 'item', team_id, item_id, version, event_seq }`). If a client disconnects, missed hints are not replayed; the client refetches current state on reconnect and falls back to periodic polling.
- **Field-Level Merge Window:** Merges are supported within a window of 10 versions (`MERGE_MAX_GAP`). Two users editing different sentences inside the same `description` field still conflict; three-way text merging is out of scope.
- **In-App Notifications Only:** Notifications are delivered within the application and inbox; third-party integrations (Slack/Email) are not built.
- **No Self-Service Password Reset:** Users are pre-seeded; authenticated users can change their password, and team leads manage memberships.
