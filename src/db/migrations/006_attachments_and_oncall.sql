-- 006_attachments_and_oncall.sql
-- Attachments, On-Call Roster, and Operational War Room Calls (Google Meet / Microsoft Teams)

-- 1. Incident & Work Item Attachments
CREATE TABLE IF NOT EXISTS work_item_attachments (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  work_item_id bigint NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  uploader_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename text NOT NULL,
  file_type text NOT NULL DEFAULT 'application/pdf',
  file_size bigint NOT NULL DEFAULT 0,
  file_data text, -- base64 or file content or URL
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attachments_item
  ON work_item_attachments (work_item_id, created_at ASC);

-- 2. Operational Calls & War Rooms
CREATE TABLE IF NOT EXISTS operational_calls (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  creator_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  platform text NOT NULL DEFAULT 'google_meet', -- 'google_meet', 'teams', 'zoom'
  meeting_url text NOT NULL,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  work_item_id bigint REFERENCES work_items(id) ON DELETE SET NULL,
  participants jsonb NOT NULL DEFAULT '[]', -- array of user ids [1, 2, 3]
  status text NOT NULL DEFAULT 'active', -- 'active', 'completed', 'cancelled'
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_operational_calls_team
  ON operational_calls (team_id, scheduled_at DESC);

-- 3. On-Call Roster / Shifts
CREATE TABLE IF NOT EXISTS on_call_shifts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier text NOT NULL DEFAULT 'primary', -- 'primary', 'secondary', 'escalation'
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_on_call_shifts_team
  ON on_call_shifts (team_id, starts_at ASC);

-- 4. Extend notifications for call invites
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS call_id bigint REFERENCES operational_calls(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_user_call
  ON notifications (user_id, call_id)
  WHERE call_id IS NOT NULL;

-- 5. Grants for runtime app
GRANT SELECT, INSERT, UPDATE, DELETE ON work_item_attachments, operational_calls, on_call_shifts TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
