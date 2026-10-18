-- 01-roles.sql
-- Create required roles with least privilege separation

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_migrator') THEN
    CREATE ROLE app_migrator WITH LOGIN PASSWORD 'migrator_dev_password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    CREATE ROLE app_runtime WITH LOGIN PASSWORD 'runtime_dev_password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_backup') THEN
    CREATE ROLE app_backup WITH LOGIN PASSWORD 'backup_dev_password';
  END IF;
END $$;

-- Grant database ownership / access to app_migrator
GRANT ALL PRIVILEGES ON DATABASE operations TO app_migrator;
ALTER DATABASE operations OWNER TO app_migrator;

-- Grant backup role access
GRANT pg_read_all_data TO app_backup;
