-- 007_workspaces_and_invitations.sql

-- 1. Workspaces table
CREATE TABLE IF NOT EXISTS workspaces (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Workspace Memberships table
CREATE TABLE IF NOT EXISTS workspace_memberships (
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_memberships_user ON workspace_memberships(user_id);

-- 3. Add workspace_id to teams
ALTER TABLE teams ADD COLUMN IF NOT EXISTS workspace_id bigint REFERENCES workspaces(id) ON DELETE CASCADE;

-- 4. Workspace Invitations table
CREATE TABLE IF NOT EXISTS workspace_invitations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id bigint NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  team_id bigint REFERENCES teams(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  email text,
  role text NOT NULL CHECK (role IN ('lead', 'member', 'viewer')),
  created_by bigint REFERENCES users(id) ON DELETE SET NULL,
  used_by bigint REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workspace_invitations_code ON workspace_invitations(code);
CREATE INDEX IF NOT EXISTS idx_workspace_invitations_ws ON workspace_invitations(workspace_id);

-- 5. Seed default workspace for Newtonite (id = 1) if not exists
INSERT INTO workspaces (id, name, slug, created_by)
OVERRIDING SYSTEM VALUE
VALUES (1, 'Newtonite Engineering', 'newtonite', (SELECT id FROM users ORDER BY id LIMIT 1))
ON CONFLICT (id) DO NOTHING;

-- Synchronize identity sequence so next auto-increment id starts at 2
SELECT setval(pg_get_serial_sequence('workspaces', 'id'), GREATEST((SELECT COALESCE(MAX(id), 1) FROM workspaces), 1));

-- Associate existing teams with default workspace
UPDATE teams SET workspace_id = 1 WHERE workspace_id IS NULL;

-- Associate demo users (Alice, Bob, Charlie, Dana, Admin) with workspace 1
INSERT INTO workspace_memberships (workspace_id, user_id, role)
SELECT 1, u.id, CASE WHEN u.id IN (1, 2) THEN 'owner' WHEN u.is_org_admin THEN 'admin' ELSE 'member' END
FROM users u
WHERE u.id <= 5
ON CONFLICT (workspace_id, user_id) DO NOTHING;

-- Grants for app_runtime least privilege role
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspaces TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_memberships TO app_runtime;
    GRANT SELECT, INSERT, UPDATE, DELETE ON workspace_invitations TO app_runtime;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
  END IF;
END $$;

