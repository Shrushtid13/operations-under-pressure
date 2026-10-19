-- 004_team_messages.sql
-- Real-time team communication and operational chat

CREATE TABLE IF NOT EXISTS team_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  team_id bigint NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  sender_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (length(trim(content)) > 0 AND length(content) <= 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fast retrieval of chronological messages per team
CREATE INDEX IF NOT EXISTS idx_team_messages_team_created
  ON team_messages (team_id, created_at ASC, id ASC);

-- Append-only immutability trigger
DROP TRIGGER IF EXISTS trg_team_messages_immutable ON team_messages;
CREATE TRIGGER trg_team_messages_immutable
BEFORE UPDATE OR DELETE ON team_messages
FOR EACH ROW EXECUTE FUNCTION trg_prevent_modification();

-- Least privilege permissions for runtime
GRANT SELECT, INSERT ON team_messages TO app_runtime;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
