-- 002_indexes_and_triggers.sql

-- 1. Immutability trigger for append-only audit tables
CREATE OR REPLACE FUNCTION trg_prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is strictly append-only. UPDATE and DELETE are prohibited.', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_work_item_events_immutable ON work_item_events;
CREATE TRIGGER trg_work_item_events_immutable
BEFORE UPDATE OR DELETE ON work_item_events
FOR EACH ROW EXECUTE FUNCTION trg_prevent_modification();

DROP TRIGGER IF EXISTS trg_membership_events_immutable ON membership_events;
CREATE TRIGGER trg_membership_events_immutable
BEFORE UPDATE OR DELETE ON membership_events
FOR EACH ROW EXECUTE FUNCTION trg_prevent_modification();

-- 2. Performance indexes
-- Main active overview in default sort order (team_id, priority DESC, updated_at DESC, id DESC)
CREATE INDEX IF NOT EXISTS idx_work_items_active 
  ON work_items (team_id, priority DESC, updated_at DESC, id DESC) 
  WHERE status IN ('open','in_progress','pending_approval');

-- Active status counts
CREATE INDEX IF NOT EXISTS idx_work_items_status 
  ON work_items (team_id, status) 
  WHERE status IN ('open','in_progress','pending_approval');

-- My work
CREATE INDEX IF NOT EXISTS idx_work_items_my_work 
  ON work_items (assignee_id, updated_at DESC, id DESC) 
  WHERE status IN ('open','in_progress','pending_approval');

-- Unfiltered / historical listing
CREATE INDEX IF NOT EXISTS idx_work_items_history 
  ON work_items (team_id, updated_at DESC, id DESC);

-- Overdue work items
CREATE INDEX IF NOT EXISTS idx_work_items_overdue 
  ON work_items (team_id, due_at) 
  WHERE due_at IS NOT NULL AND status IN ('open','in_progress','pending_approval');

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_work_items_search 
  ON work_items USING GIN (search_vector);

-- Timeline pagination
CREATE INDEX IF NOT EXISTS idx_work_item_events_timeline 
  ON work_item_events (work_item_id, seq DESC);

-- Outbox indexes
CREATE INDEX IF NOT EXISTS idx_outbox_pending 
  ON outbox (available_at) 
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_outbox_done 
  ON outbox (done_at) 
  WHERE status = 'done';

-- Cleanup indexes
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_created_at 
  ON idempotency_keys (created_at);

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at 
  ON sessions (expires_at);

-- Notification inbox
CREATE INDEX IF NOT EXISTS idx_notifications_user_inbox 
  ON notifications (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread 
  ON notifications (user_id) 
  WHERE read_at IS NULL;
