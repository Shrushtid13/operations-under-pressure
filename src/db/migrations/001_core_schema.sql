-- 001_core_schema.sql

CREATE TABLE IF NOT EXISTS users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  name text NOT NULL,
  password_hash text NOT NULL,
  is_org_admin boolean NOT NULL DEFAULT false,
  failed_logins int NOT NULL DEFAULT 0,
  last_failed_login_at timestamptz,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS teams (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  key text NOT NULL UNIQUE,
  next_item_number int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_memberships (
  team_id bigint NOT NULL REFERENCES teams(id),
  user_id bigint NOT NULL REFERENCES users(id),
  role text NOT NULL CHECK (role IN ('viewer', 'member', 'lead')),
  created_at timestamptz NOT NULL DEFAULT now(),
  removed_at timestamptz,
  PRIMARY KEY (team_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_active_user 
  ON team_memberships (user_id) WHERE removed_at IS NULL;

CREATE TABLE IF NOT EXISTS membership_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams(id),
  user_id bigint NOT NULL REFERENCES users(id),
  actor_id bigint NOT NULL REFERENCES users(id),
  action text NOT NULL CHECK (action IN ('added', 'role_changed', 'removed', 'reactivated')),
  from_role text CHECK (from_role IN ('viewer', 'member', 'lead')),
  to_role text CHECK (to_role IN ('viewer', 'member', 'lead')),
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS work_items (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams(id),
  number int NOT NULL,
  kind text NOT NULL CHECK (kind IN ('customer_issue', 'incident', 'payment', 'compliance', 'task')),
  title text NOT NULL,
  description text,
  status text NOT NULL CHECK (status IN ('open', 'in_progress', 'pending_approval', 'resolved', 'closed')),
  priority smallint NOT NULL CHECK (priority BETWEEN 1 AND 4),
  assignee_id bigint,
  requested_by bigint NOT NULL REFERENCES users(id),
  requires_approval boolean NOT NULL DEFAULT false,
  approval_requested_by bigint REFERENCES users(id),
  due_at timestamptz,
  version int NOT NULL DEFAULT 1,
  event_seq int NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  created_by bigint NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B')
  ) STORED,

  CONSTRAINT uq_work_items_team_number UNIQUE (team_id, number),
  CONSTRAINT chk_work_items_active_assignee CHECK (status NOT IN ('in_progress','pending_approval') OR assignee_id IS NOT NULL),
  CONSTRAINT chk_work_items_open_unassigned CHECK (status <> 'open' OR assignee_id IS NULL),
  CONSTRAINT chk_work_items_pending_approval CHECK ((status = 'pending_approval') = (approval_requested_by IS NOT NULL)),
  CONSTRAINT fk_work_items_team_assignee FOREIGN KEY (team_id, assignee_id) 
    REFERENCES team_memberships(team_id, user_id) MATCH SIMPLE ON DELETE NO ACTION
);

CREATE TABLE IF NOT EXISTS work_item_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_item_id bigint NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  seq int NOT NULL,
  item_version int,
  actor_id bigint NOT NULL REFERENCES users(id),
  type text NOT NULL CHECK (type IN ('created', 'updated', 'assigned', 'released', 'approval_requested', 'approved', 'rejected', 'resolved', 'closed', 'reopened', 'comment_added')),
  payload jsonb NOT NULL DEFAULT '{}',
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT uq_work_item_events_item_seq UNIQUE (work_item_id, seq),
  CONSTRAINT chk_work_item_events_comment_version CHECK ((type = 'comment_added') = (item_version IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_events_item_version 
  ON work_item_events (work_item_id, item_version) 
  WHERE item_version IS NOT NULL;

CREATE TABLE IF NOT EXISTS idempotency_keys (
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key text NOT NULL,
  request_hash text NOT NULL,
  response_status int,
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE TABLE IF NOT EXISTS outbox (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id bigint NOT NULL REFERENCES work_item_events(id) ON DELETE CASCADE,
  type text NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'done', 'dead')),
  attempts int NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lease_token uuid,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  done_at timestamptz
);

CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_item_id bigint NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  event_id bigint NOT NULL REFERENCES work_item_events(id) ON DELETE CASCADE,
  kind text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_notifications_user_event_kind UNIQUE (user_id, event_id, kind)
);
