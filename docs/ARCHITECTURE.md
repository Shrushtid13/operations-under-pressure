# Operations Under Pressure — Architecture & Codebase Reviewer Guide

This document is an exhaustive reference for code reviewers, security auditors, and system engineers inspecting the Newtonite Operations Under Pressure codebase.

---

## 1. High-Level System Architecture

The platform separates **HTTP REST APIs**, **real-time WebSocket signaling**, **asynchronous transactional outbox processing**, and the **React presentation console**.

```
                                      CLIENT BROWSER
                         ┌──────────────────────────────────────┐
                         │       React 19 SPA (Vite / Tailwind) │
                         │       TanStack Query v5 + Client Cache│
                         └───────┬──────────────────────┬───────┘
                                 │ HTTP/JSON            │ WebSocket (/ws)
                                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           FASTIFY API GATEWAY (Node.js 22)                      │
│                                                                                 │
│   [Security Hooks]   CORS ➔ Helmet ➔ Rate Limiter ➔ CSRF Check ➔ Auth Session   │
│   [Route Handlers]   Fastify JSON Schema Validation (Ajv)                       │
│   [Security PDP]     policy.js (Role Hierarchy, Separation of Duties, Scope)    │
│   [Command Service]  commands.js (ACID Transactions, State Machines, OCC)       │
│   [Query Service]    queries.js (Filtered Projections, Keyset Pagination)       │
└───────────────────────────────┬──────────────────────────────▲──────────────────┘
                                │ ACID Transaction             │ pg_notify
                                ▼                              │
┌──────────────────────────────────────────────────────────────┴──────────────────┐
│                               POSTGRESQL 16 PRIMARY                             │
│                                                                                 │
│  - work_items (version, event_seq, status, priority, due_at, fix_approved)     │
│  - work_item_assignees (work_item_id, user_id, assigned_at)                     │
│  - work_item_events (append-only immutable audit log, enforced by DB trigger)   │
│  - idempotency_keys (canonical SHA-256 hash, response status & body cache)      │
│  - outbox (transactional event queue, pending messages)                         │
│  - users, workspaces, workspace_memberships, team_memberships, sessions         │
└───────────────────────────────┬─────────────────────────────────────────────────┘
                                │ FOR UPDATE SKIP LOCKED
                                ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                     BACKGROUND OUTBOX WORKER (worker.js)                        │
│                                                                                 │
│  - Drains outbox batches, generates deduplicated notifications                  │
│  - Runs proactive deadline reminder scans (24h approaching & overdue alerts)    │
│  - Manages worker leases, session cleanups, and idempotency key expiration       │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Annotated Codebase Directory Tree

```
d:\operations\
├── README.md                      # Primary setup, test instructions, and operational guarantees
├── package.json                   # Dependencies, Node >=22 engines, test and dev scripts
├── docker-compose.yml             # PostgreSQL 16 Alpine container configuration
│
├── docs/                          # In-depth architectural & verification documentation
│   ├── ARCHITECTURE.md            # This reviewer guide (patterns, security, file map)
│   └── RESTORE_TEST.md            # Backup & disaster recovery verification report
│
├── src/                           # Backend Application Source Code
│   ├── README.md                  # Detailed backend architectural documentation
│   ├── api/                       # HTTP & WebSocket API Layer
│   │   ├── server.js              # Fastify server bootstrap, plugins, hooks, error handler
│   │   ├── websocket.js           # Real-time WebSocket gateway & team pub/sub broadcast
│   │   ├── hooks/                 # Middleware & Security Guards
│   │   │   ├── authHook.js        # Session cookie decoder, DB session lookup, req.user
│   │   │   └── csrfHook.js        # CSRF mitigation (x-requested-by & Origin/Host check)
│   │   └── routes/                # REST Route Controllers with JSON Schema Validation
│   │       ├── authRoutes.js      # Register (Argon2id), Login, Logout, Me, Password
│   │       ├── workItemRoutes.js  # Work item lifecycle, assignees, transitions, attachments
│   │       ├── workspaceRoutes.js # Multi-tenant workspaces, invites, and join logic
│   │       ├── teamRoutes.js      # Team membership, chat, on-call schedules & war rooms
│   │       ├── overviewRoutes.js  # High-level metrics & SLA health counters
│   │       └── notificationRoutes.js # User inbox, alerts, and read receipts
│   │
│   ├── services/                  # Core Domain & Business Logic
│   │   ├── policy.js              # Policy Decision Point (PDP): RBAC, 403 Forbidden rules
│   │   ├── commands.js            # Command Service: State machines, OCC, audit log, outbox
│   │   ├── queries.js             # Query Service (CQRS): Filtered list queries, aggregations
│   │   ├── reminderService.js     # Proactive deadline alerts (approaching & overdue checks)
│   │   ├── workspaceService.js    # Multi-tenant workspace management and invites
│   │   └── authService.js         # Argon2id password hashing and session management
│   │
│   ├── worker/                    # Asynchronous Background Processing
│   │   └── worker.js              # Transactional Outbox processor & deadline monitor
│   │
│   ├── db/                        # Database Connection, Migration & Seeding
│   │   ├── pool.js                # PostgreSQL connection pools (runtime, migrator, worker)
│   │   ├── migrator.js            # Database migration runner (schema_migrations tracking)
│   │   ├── seed.js                # Deterministic seed data (Newtonite accounts & teams)
│   │   └── migrations/            # Ordered, immutable SQL schema migrations
│   │       ├── 001_core_schema.sql
│   │       ├── 002_indexes_and_triggers.sql
│   │       ├── ...
│   │       └── 011_multiple_assignees_and_approvals.sql
│   │
│   └── shared/                    # Shared Utilities
│       ├── config.js              # Environment variable validation & centralized configs
│       ├── errors.js              # Typed application domain errors (AppError hierarchy)
│       └── logger.js              # Pino structured JSON logging
│
├── web/                           # Frontend Single-Page Application (React 19 + Vite)
│   ├── index.html                 # Single HTML entry point
│   ├── vite.config.js             # Vite development server & reverse proxy configuration
│   └── src/
│       ├── main.jsx               # React entry point, QueryClientProvider bootstrap
│       ├── App.jsx                # Root router, global query orchestration, modal controllers
│       ├── api.js                 # Unified frontend API client (fetchApi wrapper, UUID keys)
│       ├── useWebSocket.js        # WebSocket auto-reconnect hook with query cache invalidation
│       ├── index.css              # Tailwind CSS styles & typography
│       └── components/            # UI Views & Interactive Modals
│           ├── README.md          # Frontend component catalog and screen mapping
│           ├── index.js           # Unified component barrel export
│           ├── Sidebar.jsx        # Navigation sidebar, team & workspace selector
│           ├── Header.jsx         # Search bar, notifications popover, status indicators
│           ├── WorkItemDetail.jsx # Detailed job view, multi-assignee sidebar, approvals
│           ├── WorkListView.jsx   # List/table view with status tabs and priority filters
│           ├── WorkItemRow.jsx    # Individual work item row with multi-avatar stack
│           ├── OverviewView.jsx   # Operations overview dashboard & high-priority jobs
│           ├── CreateItemModal.jsx# New job creation with deadlines & preset hours
│           ├── EditItemModal.jsx  # Edit modal with inline 409 conflict resolution
│           ├── ConflictModal.jsx  # Lost-update conflict modal (Take theirs vs Overwrite)
│           ├── LoginView.jsx      # Login and account registration screens
│           ├── InboxView.jsx      # Inbox notification center
│           ├── TeamMembersView.jsx# Team member directory and invitation management
│           ├── TeamChatView.jsx   # Operational chat view
│           ├── OnCallView.jsx     # On-call rota & war room meeting scheduler
│           ├── AccountView.jsx    # Profile settings & password changes
│           ├── WorkspaceOnboardingView.jsx # Workspace creation & onboarding wizard
│           ├── NotificationToaster.jsx     # Floating real-time toast alert popups
│           └── legacy/            # Archived prototype stubs (superseded by active components)
│               └── README.md      # Archival mapping of prototype stubs to active replacements
│
├── test/                          # Comprehensive Automated Test Suite
│   ├── api.test.js                # End-to-end workflow, security, audit & invariant tests
│   ├── concurrency.test.js        # Parallel race condition tests (claims, lost-updates, idempotency)
│   ├── deadlines.test.js          # Deadline alerts, approaching notifications, deduplication
│   ├── workspaces.test.js         # Multi-tenant isolation, invitations, and role tests
│   └── testHelper.js              # Shared test fixtures, auth tokens, database resets
│
└── scripts/                       # Operations & Maintenance Scripts
    ├── backup.js                  # Timestamped logical backup generator with SHA-256
    └── scan-frontend-leaks.js     # Security scanner for token/credential leaks in frontend
```

---

## 3. Core Enterprise Architectural Patterns

### A. Command-Query Responsibility Segregation (CQRS)
* **Write Pipeline (`src/services/commands.js`)**: All state-modifying requests execute within atomic database transactions via `withTransaction()`. Every write increments `version` and `event_seq`, inserts an immutable audit log row into `work_item_events`, inserts a pending record into `outbox`, and broadcasts `pg_notify('item_changes', ...)`.
* **Read Pipeline (`src/services/queries.js`)**: Pure read queries run with optimized indexing, keyset pagination (`WHERE (w.priority, w.created_at, w.id) < (...)`), subqueries for co-assignees, and tenant isolation. Reads never acquire write locks.

### B. Security: Policy Enforcement Point (PEP) & Policy Decision Point (PDP)
* **PEP (Routes)**: All incoming API requests pass through `authHook.js` to verify session validity and attach `req.user`.
* **PDP (`src/services/policy.js`)**: Centralized authorization policy engine (`assertCan(user, action, resource)`).
  * Enforces strict role hierarchies: `viewer` (10) < `member` (20) < `lead` (30) < `org_admin` (40).
  * Enforces **Separation of Duties**: An assignee submitting a fix for approval cannot approve their own fix (`approval_requested_by <> caller.id`).
  * Enforces **Assignee Resolution**: Team leads cannot resolve jobs; only current assignees can mark jobs as resolved after approval.

### C. Optimistic Concurrency Control (OCC) & Lost-Update Prevention
* Every mutating endpoint requires `expected_version`.
* If a collaborator modified the record in the interim, PostgreSQL row checks detect the version mismatch and throw `409 VERSION_CONFLICT`.
* If the changes affect non-conflicting fields within a safe gap, the server merges them automatically. If the same field was touched, the UI displays the conflict resolution prompt ("Take theirs" vs "Overwrite with mine") while preserving the user's unsaved draft.

### D. Transactional Outbox Pattern
* To avoid dual-write bugs between PostgreSQL and notification services, notifications and emails are not dispatched during the HTTP request.
* Instead, an `outbox` record is written inside the **exact same ACID transaction** as the work item update.
* The independent background daemon (`src/worker/worker.js`) polls `outbox` using `FOR UPDATE SKIP LOCKED`, guaranteeing at-least-once delivery with deduplication (`UNIQUE (user_id, event_id, kind)`).

### E. Multi-Assignee & Collaboration Model
* Work items support multiple collaborators working simultaneously via the `work_item_assignees` relationship table.
* Team leads can assign two or more members in a single atomic action.
* When any collaborator updates the job, a real-time event is broadcast over WebSockets, displaying an on-screen update notification to any other collaborator viewing the work item.

---

## 4. Reviewer Verification Guide

To verify the implementation and all architectural guarantees:

```bash
# 1. Run the full test suite (22 tests across 4 test suites)
npm test

# 2. Run concurrency & race-condition tests specifically
npm run test:concurrency

# 3. Inspect database migration integrity
npm run migrate

# 4. Verify disaster recovery backup
npm run backup
```
