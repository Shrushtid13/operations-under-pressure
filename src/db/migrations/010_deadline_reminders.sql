-- 010_deadline_reminders.sql
-- Indexes and constraints for automated deadline reminder notifications

-- 1. Deduplicate deadline reminders per user, work item, and reminder kind
CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_deadline_reminder
  ON notifications (user_id, work_item_id, kind)
  WHERE kind IN ('deadline_approaching', 'deadline_overdue');

-- 2. Optimize lookup for work items with upcoming or past deadlines
CREATE INDEX IF NOT EXISTS idx_work_items_due_at
  ON work_items (due_at)
  WHERE status IN ('open', 'in_progress', 'pending_approval') AND due_at IS NOT NULL;

-- 3. Grants for managing and clearing deadline reminder notifications
GRANT DELETE ON notifications TO app_runtime;
