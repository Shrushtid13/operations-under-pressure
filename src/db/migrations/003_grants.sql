-- 003_grants.sql
-- Least-privilege role permissions per §10.6

REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_runtime;
GRANT USAGE ON SCHEMA public TO app_backup;

-- users table
GRANT SELECT, INSERT ON users TO app_runtime;
GRANT UPDATE (password_hash, failed_logins, last_failed_login_at, locked_until) ON users TO app_runtime;

-- sessions table
GRANT SELECT, INSERT, DELETE ON sessions TO app_runtime;
GRANT UPDATE (last_seen_at, revoked_at) ON sessions TO app_runtime;

-- teams table
GRANT SELECT, INSERT, UPDATE ON teams TO app_runtime;

-- team_memberships table (no DELETE)
GRANT SELECT, INSERT ON team_memberships TO app_runtime;
GRANT UPDATE (role, removed_at) ON team_memberships TO app_runtime;

-- membership_events table (append-only)
GRANT SELECT, INSERT ON membership_events TO app_runtime;

-- work_items table (no DELETE)
GRANT SELECT, INSERT, UPDATE ON work_items TO app_runtime;

-- work_item_events table (append-only)
GRANT SELECT, INSERT ON work_item_events TO app_runtime;

-- idempotency_keys table
GRANT SELECT, INSERT, DELETE ON idempotency_keys TO app_runtime;
GRANT UPDATE (response_status, response_body) ON idempotency_keys TO app_runtime;

-- outbox table
GRANT SELECT, INSERT, UPDATE, DELETE ON outbox TO app_runtime;

-- notifications table
GRANT SELECT, INSERT ON notifications TO app_runtime;
GRANT UPDATE (read_at) ON notifications TO app_runtime;

-- Sequence / identity grants for generated identity columns
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_runtime;
