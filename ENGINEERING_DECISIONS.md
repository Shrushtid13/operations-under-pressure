# Engineering Decisions: Operations Under Pressure

This document details five fundamental architectural and engineering decisions made while designing and implementing the Newtonite Operations platform. Each section outlines the decision, alternatives considered, trade-offs, and rationale.

---

## 1. Data Structuring: Relational State, Multi-Assignee Normalization, and Immutable Audit Trails

### Decision
The datastore is structured around a normalized relational model in PostgreSQL 16:
- Core work items (`work_items`) store authoritative mutable state (`version`, `status`, `priority`, `due_at`, `fix_approved`).
- Multiple collaborators are modeled via a first-class junction table (`work_item_assignees`) with foreign key constraints, enabling concurrent co-assignees while maintaining a primary assignee reference.
- Every state mutation writes an append-only row to `work_item_events` with contiguous `seq` counters and `item_version` linkages. Database triggers and PostgreSQL role permission restrictions (`REVOKE UPDATE, DELETE ON work_item_events FROM app_runtime`) guarantee that audit records cannot be altered or purged.
- Discussions and comments advance `seq` and update `last_activity_at`, but do **not** increment `version`.

### Alternatives Considered
- **NoSQL / Document store (MongoDB)**: Storing entire work items as JSON documents.
- **Full Event Sourcing**: Storing only events and replaying them to derive state.
- **Post-commit audit logs**: Writing audit entries from application middleware after the commit.

### Trade-offs & Rationale
- **Relational consistency & zero gap auditing**: Writing state changes and event rows in the same transaction guarantees 100% audit integrity—if the transaction commits, both the current state and its immutable audit trail exist.
- **Why not full event sourcing**: Full event sourcing requires complex projections, read models, and replay snapshots that introduce query lag and operational overhead. In operational centers, operators need instant, sub-millisecond filtering and keyset pagination, which normalized SQL tables provide natively.
- **Decoupling comments from versioning**: Because comments only bump `seq`, engineers discussing an incident in the comments never trigger spurious `409 VERSION_CONFLICT` errors for an engineer concurrently editing the item's priority or description.

---

## 2. Handling Concurrent Updates: OCC via `expected_version`, Atomic Claim Locks, and Disjoint Field Merging

### Decision
Concurrency is managed using **Optimistic Concurrency Control (OCC)** coupled with atomic conditional updates:
1. **Atomic Claims**: Claiming open work uses conditional row updates (`WHERE id = $id AND status = 'open' AND version = $expected`). Simultaneous claims serialize at PostgreSQL's row locks. Exactly one claimant wins; losers match zero rows and immediately receive a `409 ALREADY_ASSIGNED` response containing the winner’s identity.
2. **Lost-Update Prevention**: State-modifying requests (`PATCH /work-items/:id`) require an `expected_version`. If a collaborator modified the record in the interim, PostgreSQL detects the version mismatch.
3. **Disjoint Field-Level Merging**: If intervening changes touched different fields (e.g. user A updated `title` while user B updated `priority`), the server automatically merges the non-conflicting fields within a safe version gap (`MERGE_MAX_GAP = 10`), commits the merged state, and tags the event with `merged_from_version`.
4. **Draft-Preserving Conflict Resolution**: If both users modified the same field, the server returns `409 VERSION_CONFLICT` with `conflicting_fields` and current server values. The UI presents an interactive resolution dialog ("Take theirs" vs. "Overwrite with mine") without discarding the user's unsaved local draft.

### Alternatives Considered
- **Pessimistic locking**: `SELECT ... FOR UPDATE` held while a user views or edits an item.
- **PostgreSQL `SERIALIZABLE` isolation**: Relying on database serialization failure retries.
- **Last-Write-Wins (LWW)**: Blindly overwriting records with the latest incoming payload.

### Trade-offs & Rationale
- **Human think-time tolerance**: Operational users spend minutes reviewing context, drafting steps, or communicating before submitting changes. Holding database row locks or transactions during human think-time would rapidly exhaust database connection pools and freeze out other collaborators.
- **Zero data loss**: Last-Write-Wins silently destroys critical information. OCC guarantees that every collaborator is explicitly informed of concurrent modifications, while automatic field merging prevents unnecessary conflict alerts on disjoint edits.

---

## 3. Synchronous vs. Asynchronous Boundary: Atomic ACID Transactions + Transactional Outbox Pattern

### Decision
The system draws a strict boundary between what happens synchronously within the HTTP request lifecycle and what executes asynchronously in background workers:
- **Synchronous (In-Transaction)**:
  - Input validation via Ajv JSON Schemas.
  - Policy Decision Point (PDP) authorization and Separation of Duties checks.
  - State transitions, version bumps, and append-only event insertion.
  - Insertion of notification and integration tasks into the `outbox` table.
  - Idempotency key registration and response payload caching.
  - PostgreSQL `NOTIFY` broadcast (`pg_notify('item_changes', ...)`) to wake up WebSocket listeners.
- **Asynchronous (Background Daemon)**:
  - Draining pending messages from the `outbox` table using `FOR UPDATE SKIP LOCKED`.
  - Notification deduplication (`UNIQUE (user_id, event_id, kind)`) and dispatch.
  - Periodic scans for approaching (24h) and overdue deadlines via `reminderService`.
  - Garbage collection of expired sessions and idempotency keys.

### Alternatives Considered
- Synchronous notification generation and dispatch during the HTTP mutation.
- Offloading event publishing to external distributed message brokers (RabbitMQ, Kafka, AWS SQS).

### Trade-offs & Rationale
- **Dual-write elimination**: Dispatching notifications or publishing to external message queues inside an HTTP handler creates unavoidable dual-write bugs. If PostgreSQL commits but the message broker fails, the event is lost; if the message is published but PostgreSQL rolls back, ghost notifications are sent. Writing outbox rows inside the **exact same ACID transaction** as the business mutation guarantees that notifications are produced if and only if the state change succeeds.
- **Fast, predictable HTTP latency**: API response times remain low and independent of downstream notification consumers.

---

## 4. Authorization Architecture: Centralized PDP, SQL-Scoped Multi-Tenancy, and Strict Assignee Resolution

### Decision
Authorization follows the **Policy Decision Point (PDP) / Policy Enforcement Point (PEP)** pattern implemented in `src/services/policy.js`:
1. **Hierarchical RBAC**: Scoped team roles follow `viewer` (10) < `member` (20) < `lead` (30) < `org_admin` (40).
2. **Multi-Tenant Isolation**: Tenant and team boundaries are enforced directly in SQL (`WHERE team_id IN (SELECT team_id FROM team_memberships WHERE user_id = $me AND removed_at IS NULL)`). Requests for unauthorized items return `404 NOT_FOUND` rather than `403 FORBIDDEN` to prevent resource existence leakage.
3. **Separation of Duties (SoD)**: For work items requiring approval, the lead who signs off cannot be the person who requested approval (`approval_requested_by <> caller.id`).
4. **Assignee-Only Resolution**: Team leads can approve fixes, which transitions the item back to `in_progress` with `fix_approved = true`. However, leads are **strictly forbidden** from resolving work; the `resolve` action can only be executed by a user currently assigned to the job.

### Alternatives Considered
- Embedding role claims inside stateless JWT tokens.
- Third-party authorization frameworks (OPA, Casbin).
- Allowing team leads to resolve any work item directly without assignee verification.

### Trade-offs & Rationale
- **Immediate permission revocation**: Storing roles in JWTs creates a security window where demoted or removed users can continue mutating critical items until token expiration. Validating session tokens against PostgreSQL and querying current memberships inside the transaction ensures instant revocation.
- **Operational accountability**: Forcing the active assignee to perform the final resolution ensures that the engineer who executed the fix verifies the solution in practice, preventing premature closures by management.

---

## 5. What Was Intentionally Not Built (and Why)

### Decision
Several common architectural choices and features were deliberately excluded:
1. **No Redis or External Message Broker (Kafka / RabbitMQ)**:
   - *Rationale*: A single PostgreSQL 16 database running `FOR UPDATE SKIP LOCKED` for the transactional outbox and `LISTEN / NOTIFY` for real-time WebSocket hints handles thousands of concurrent operations with zero external infrastructure dependencies. Adding Redis or Kafka would introduce network boundaries, separate clustering, connection pool tuning, and dual-write failure modes without providing meaningful throughput benefits at this scale.
2. **No Full In-Memory State Synchronization or Operational Transformation (OT/CRDTs)**:
   - *Rationale*: Collaborative rich text editing (Google Docs style) is unnecessary for structured operations work items (titles, descriptions, priorities, deadlines). Field-level merging with OCC provides robust multi-user collaboration without the complexity and memory overhead of CRDTs.
3. **No Blind Client-Side `OFFSET / LIMIT` Pagination**:
   - *Rationale*: `OFFSET` degrades query performance on large tables ($O(N)$ row scan) and causes missing or duplicate rows when items are created or deleted during pagination. Keyset pagination on `(priority, updated_at, id)` guarantees $O(1)$ index lookups regardless of query depth.
4. **No Ephemeral WebSocket Replay Buffer**:
   - *Rationale*: WebSocket messages are treated strictly as **lightweight cache invalidation hints** (`{ type: 'item', team_id, item_id, version }`). The client's TanStack Query cache automatically refetches the authoritative state via REST upon receiving a hint or reconnecting. This eliminates the need for distributed WebSocket state stores or sticky sessions.
5. **No Client-Side Authorization Logic as a Source of Truth**:
   - *Rationale*: While the UI conditionally hides buttons for clean UX, all authorization policies are enforced authoritatively on the server. No client parameter can bypass server-side role checks, separation of duties, or assignee resolution guards.
