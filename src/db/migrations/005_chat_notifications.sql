-- 005_chat_notifications.sql
-- Allow notifications to reference either work items/events or team messages

ALTER TABLE notifications ALTER COLUMN work_item_id DROP NOT NULL;
ALTER TABLE notifications ALTER COLUMN event_id DROP NOT NULL;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS team_id bigint REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message_id bigint REFERENCES team_messages(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_message
  ON notifications (user_id, message_id)
  WHERE message_id IS NOT NULL;
