# Engineering Decisions: Operations Under Pressure

This document details the five most consequential engineering decisions and trade-offs made while designing and building the system to address the Newtonite candidate brief.

---

## 1. PostgreSQL as Single Source of Truth + Transactional Outbox (No Redis/Kafka)

### Decision
All operational state, append-only history, idempotency keys, sessions, and asynchronous notification intents are stored in a single PostgreSQL 16 database. Background asynchronous processing (notifications and maintenance) is driven via an Outbox table drained with `FOR UPDATE SKIP LOCKED`.

### Alternatives Considered
- Dedicated message brokers (RabbitMQ, Kafka, AWS SQS)
- In-memory cache/queues (Redis)
- Synchronous notification fanout during the HTTP mutation request

### Trade-offs & Rationale
- **Dual-write elimination:** Secondary brokers make atomic dual-writes impossible without distributed transactions (2PC). Emitting state changes to Postgres and notifications to Kafka creates failure modes where database transactions roll back while notifications leak, or vice versa.
- **Atomic state + intent:** In this architecture, updating item state, appending an audit event, generating an outbox row, and recording the idempotency response happen in **one single database transaction**. If the transaction commits, all artifacts are guaranteed to exist.
- **Operational simplicity:** Tens of thousands of active work items with hundreds of concurrent users is well within PostgreSQL’s capabilities. Introducing Redis or Kafka would add operational complexity, separate connection management, and multiple points of failure without solving a genuine throughput bottleneck at this scale.

---

## 2. Optimistic Concurrency via `version` + Atomic Conditional Updates for Claim

### Decision
Mutations use PostgreSQL `READ COMMITTED` with atomic conditional `WHERE` clauses (`UPDATE ... WHERE id = $id AND version = $expected AND status = $from`) rather than distributed locks, pessimistic row locks across human think time, or `SERIALIZABLE` isolation. Stale PATCH requests on content fields undergo automated field-level merge when intervening changes are disjoint, or return `409 VERSION_CONFLICT` with `conflicting_fields` when concurrent users edit the same fields.

### Alternatives Considered
- Pessimistic locking (`SELECT ... FOR UPDATE` held while the user views or edits an item)
- PostgreSQL `SERIALIZABLE` isolation
- Last-write-wins (LWW)

### Trade-offs & Rationale
- **Human think-time compatibility:** Operational users take seconds or minutes between opening an item and taking action. Holding database row locks during human think-time would exhaust connection pools and freeze concurrent users.
- **Zero lost updates:** Under conditional updates, simultaneous mutations serialize at the row lock in PostgreSQL. The second committer re-evaluates the `WHERE` predicate after the winner commits, matches zero rows, and the service layer returns a structured 409 conflict containing the current server state, preserving the user's local draft.
- **Graceful collaboration:** For content edits (PATCH), field-level merge automatically combines disjoint updates (e.g., user A modifies title while user B modifies priority), preventing spurious conflicts while strictly rejecting overlapping modifications.

---

## 3. Append-Only Event Table with Contiguous `seq` and `item_version` (Not Event Sourcing)

### Decision
Every state change writes an event to `work_item_events` in the same transaction. Events are strictly append-only, enforced by both database triggers and restricted database role permissions (`REVOKE UPDATE, DELETE`). Timeline ordering uses a per-item `seq` counter, while state-changing events link to `item_version`. Comments advance `seq` and `last_activity_at`, but leave `version` untouched.

### Alternatives Considered
- Full Event Sourcing (deriving state solely by replaying events)
- Post-commit audit logging via middleware
- Trigger-only audit history

### Trade-offs & Rationale
- **Auditable trustworthiness:** Management and compliance require an immutable record of who changed what and why a decision was made. Middleware logs can fail or lose context if the application crashes post-commit. In-transaction event insertion guarantees 100% audit completeness.
- **Why not full event sourcing:** The brief requires high query performance on lists, filters, and search. Event sourcing would introduce projections, read models, and replay machinery that add immense complexity without product benefit. Current state lives authoritatively in `work_items`, while `work_item_events` provides the audit trail.
- **Separation of comments from versioning:** Because comments only advance `seq` and do not bump `version`, users collaborating in discussion never cause spurious `409 VERSION_CONFLICT` errors for an engineer editing the item description or priority.

---

## 4. Single Resource-Level Authorization Policy with SQL-Scoped Listings

### Decision
Authorization is enforced via a single resource-level policy (`can(user, action, workItem)`) evaluated inside the transaction using database-loaded roles. Non-members receive a `404 NOT_FOUND` (preventing existence leaks), while users with insufficient role receive a `403 FORBIDDEN`. All list queries enforce team scoping directly in SQL (`team_id IN (SELECT ... FROM team_memberships WHERE user_id = $me AND removed_at IS NULL)`).

### Alternatives Considered
- Role-based Access Control (RBAC) claims encoded in JWT tokens
- Dedicated policy engine (OPA / Casbin)
- Filtering results in application memory after fetching

### Trade-offs & Rationale
- **Immediate revocation:** Encoding team roles in stateless tokens creates a window where a demoted or removed employee can continue mutating sensitive items until token expiry. Querying memberships inside the transaction (under row locks) guarantees that role revocation takes effect on the very next request.
- **Information leak prevention:** Hiding UI buttons is insufficient. Scoping queries in SQL guarantees that crafted API requests cannot discover work items, notifications, or team names outside the caller’s authorized teams.
- **Strict Separation of Duties:** For items requiring formal approval, the SQL update requires `approval_requested_by <> caller.id`, ensuring at the database level that leads cannot sign off on their own requests.

---

## 5. Keyset Pagination + Server-Defined Attention Metrics + Partial Indexes

### Decision
Listings use keyset pagination based on `(priority, updated_at, id)` or `(updated_at, id)` instead of `OFFSET / LIMIT`. "Needs Attention" is defined authoritatively on the server. Active items are indexed using PostgreSQL partial indexes (`WHERE status IN ('open', 'in_progress', 'pending_approval')`).

### Alternatives Considered
- Traditional `OFFSET / LIMIT` pagination
- Client-side filtering and full-dataset loading
- Elasticsearch / external search cluster

### Trade-offs & Rationale
- **Scale and stable pagination:** `OFFSET` queries degrade as history grows into hundreds of thousands of items because PostgreSQL must scan and discard all preceding rows. Keyset pagination uses row-value comparisons on indexed tuples, maintaining constant query time regardless of page depth, while remaining immune to duplicate or skipped items during concurrent inserts.
- **Consistent attention metrics:** Defining attention rules in the backend (unassigned high-priority work, overdue items, stale work with no activity for 3 days, and pending approvals) ensures that all clients and automated monitors have an identical, testable definition of what requires action.
- **Small working set:** By indexing only active items via partial indexes, history can grow to millions of closed rows without inflating index size or slowing down active operations dashboards.
