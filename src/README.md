# Backend Architecture & Directory Guide (`src/`)

This directory contains the entire backend runtime of the Newtonite Operations Under Pressure platform.

The system is built on **Node.js (>=22)**, **Fastify v5**, and **PostgreSQL 16**, following high-performance enterprise architectural patterns:
1. **Command-Query Responsibility Segregation (CQRS)**
2. **Policy Decision Point (PDP) / Policy Enforcement Point (PEP)**
3. **Optimistic Concurrency Control (OCC) with Field-Level Merging**
4. **Transactional Outbox Pattern**

---

## 1. Directory Tree & Responsibilities

```
src/
├── api/                           # REST & WebSocket API Gateway (Fastify)
│   ├── server.js                  # Fastify bootstrap, plugins, security headers, error handler
│   ├── websocket.js               # Real-time WebSocket connection manager & PG LISTEN/NOTIFY bridge
│   ├── hooks/                     # Request Lifecycle Hooks (Security Middleware)
│   │   ├── authHook.js            # Session verification via HttpOnly cookies, sets req.user
│   │   └── csrfHook.js            # Origin/Host header checks & x-requested-by verification
│   └── routes/                    # Declarative REST Route Controllers (Ajv JSON Schema)
│       ├── authRoutes.js          # Authentication (Argon2id), session management, password updates
│       ├── workItemRoutes.js      # Work items: claims, multi-assignees, approvals, attachments
│       ├── workspaceRoutes.js     # Multi-tenant workspaces & invitation management
│       ├── teamRoutes.js          # Team membership, chat messaging, and on-call schedules
│       ├── overviewRoutes.js      # Executive SLA health counters & attention metrics
│       └── notificationRoutes.js  # User notifications inbox & unread counts
│
├── services/                      # Core Business Logic & Domain Services
│   ├── policy.js                  # Policy Decision Point (PDP): RBAC, 403 Forbidden rules, SoD
│   ├── commands.js                # Command Service (Write Pipeline): ACID transactions, OCC, outbox
│   ├── queries.js                 # Query Service (Read Pipeline): Filtered views, keyset pagination
│   ├── reminderService.js         # Proactive deadline monitors (24h approaching & overdue alerts)
│   ├── workspaceService.js        # Multi-tenant workspace creation and invite acceptance logic
│   └── authService.js             # Password hashing (Argon2id) and crypto session tokens
│
├── worker/                        # Asynchronous Background Daemon
│   └── worker.js                  # Transactional Outbox processor & deadline reminder scheduler
│
├── db/                            # Datastore Connection & Migrations
│   ├── pool.js                    # Least-privilege PostgreSQL connection pools
│   ├── migrator.js                # Database schema migration runner
│   ├── seed.js                    # Seed data with deterministic demo teams and users
│   └── migrations/                # Immutable, sequential SQL migrations (001 - 011)
│       ├── 001_core_schema.sql
│       ├── 002_indexes_and_triggers.sql
│       ├── 003_grants.sql
│       ├── ...
│       └── 011_multiple_assignees_and_approvals.sql
│
└── shared/                        # Shared Cross-Cutting Utilities
    ├── config.js                  # Environment configuration and validation
    ├── errors.js                  # Typed domain error hierarchy (AppError, ConflictError, etc.)
    └── logger.js                  # Pino structured JSON logging
```

---

## 2. Key Architecture Concepts for Reviewers

### Where is the API layer?
The API layer is hosted in **`src/api/`**:
- **Entry Point**: `src/api/server.js` initializes Fastify with `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit`, `@fastify/cookie`, and `@fastify/websocket`.
- **Validation**: Every route specifies an Ajv JSON Schema for request parameters, query strings, and payloads. Invalid requests are rejected with a standardized `400 VALIDATION_ERROR` before reaching domain handlers.
- **WebSocket Gateway**: `src/api/websocket.js` maintains persistent WebSocket connections with authenticated clients and bridges PostgreSQL `LISTEN / NOTIFY` events to browser clients.

### Where is authentication and authorization?
- **Authentication**: `src/api/hooks/authHook.js` validates the `session_token` cookie against the PostgreSQL `sessions` table and populates `req.user`. Non-public endpoints require authentication; missing or expired sessions reject with `401 UNAUTHORIZED`.
- **CSRF Mitigation**: `src/api/hooks/csrfHook.js` validates `Origin` / `Host` headers and verifies `X-Requested-By: Newtonite` on mutating requests.
- **Authorization (PDP)**: `src/services/policy.js` provides centralized Policy Decision Point logic via `assertCan(user, action, resource)`.
  - Roles: `viewer` (10) < `member` (20) < `lead` (30) < `org_admin` (40).
  - Multi-tenant isolation: Users cannot access work items outside their assigned teams (`404 NOT_FOUND` to prevent existence leakage).
  - Separation of Duties: An assignee submitting a fix for approval cannot approve their own fix (`approval_requested_by <> caller.id`).
  - Strict Assignee Resolution: Team leads cannot resolve jobs; only current assignees can mark jobs as resolved after approval.

### Where is business logic and state management?
- **Write Pipeline (`src/services/commands.js`)**: State mutations run inside single ACID transactions via `withTransaction()`. Every write:
  1. Enforces `expected_version` for Optimistic Concurrency Control (OCC).
  2. Updates work item state.
  3. Inserts an immutable row into `work_item_events`.
  4. Inserts an event row into the `outbox` table.
  5. Caches the response against the request's `Idempotency-Key`.
  6. Dispatches `pg_notify('item_changes', ...)`.
- **Read Pipeline (`src/services/queries.js`)**: Keyset-paginated read projections that execute indexed SELECT queries without acquiring write locks.

### Where are asynchronous jobs executed?
- **Outbox Worker (`src/worker/worker.js`)**: An independent background daemon running `FOR UPDATE SKIP LOCKED` against the `outbox` table. It reliably delivers notifications, executes periodic deadline scans via `reminderService.js`, and cleans up expired idempotency keys and sessions.
