-- 011_multiple_assignees_and_approvals.sql

-- Add fix approval tracking columns to work_items
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS fix_approved boolean NOT NULL DEFAULT false;
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS fix_approved_by bigint REFERENCES users(id);
ALTER TABLE work_items ADD COLUMN IF NOT EXISTS fix_approved_at timestamptz;

-- Multiple assignees support per work item
CREATE TABLE IF NOT EXISTS work_item_assignees (
  work_item_id bigint NOT NULL REFERENCES work_items(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_by bigint REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (work_item_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_work_item_assignees_user ON work_item_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_work_item_assignees_item ON work_item_assignees(work_item_id);

-- Backfill existing assignments into work_item_assignees
INSERT INTO work_item_assignees (work_item_id, user_id, assigned_at)
SELECT id, assignee_id, coalesce(updated_at, now())
FROM work_items
WHERE assignee_id IS NOT NULL
ON CONFLICT (work_item_id, user_id) DO NOTHING;

-- Grant permissions to app_runtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON work_item_assignees TO app_runtime;
  END IF;
END $$;

