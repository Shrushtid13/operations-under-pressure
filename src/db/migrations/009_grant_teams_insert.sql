-- 009_grant_teams_insert.sql

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    GRANT INSERT, UPDATE ON teams TO app_runtime;
  END IF;
END $$;
