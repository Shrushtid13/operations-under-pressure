// src/shared/config.js
import fs from 'node:fs';

// Node 22 native env file loading
if (typeof process.loadEnvFile === 'function') {
  if (fs.existsSync('.env')) {
    process.loadEnvFile('.env');
  }
}


function getEnv(key, defaultValue = undefined, required = false) {
  const val = process.env[key] ?? defaultValue;
  if (required && (val === undefined || val === '')) {
    throw new Error(`Configuration error: missing required environment variable ${key}`);
  }
  return val;
}

function getIntEnv(key, defaultValue, required = false) {
  const val = getEnv(key, defaultValue, required);
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    throw new Error(`Configuration error: environment variable ${key} must be an integer, got "${val}"`);
  }
  return parsed;
}

export const config = {
  env: getEnv('NODE_ENV', 'development'),
  isProduction: getEnv('NODE_ENV') === 'production',
  port: getIntEnv('PORT', 3000),
  host: getEnv('HOST', '0.0.0.0'),
  appOrigin: getEnv('APP_ORIGIN', 'http://localhost:5173', true),
  cookieSecret: getEnv('COOKIE_SECRET', 'operations-under-pressure-cookie-secret-key-32chars', true),

  db: {
    runtimeUrl: getEnv('DATABASE_URL', 'postgres://app_runtime:runtime_dev_password@127.0.0.1:5435/operations', true),
    migratorUrl: getEnv('MIGRATION_DATABASE_URL', getEnv('DATABASE_URL', 'postgres://app_migrator:migrator_dev_password@127.0.0.1:5435/operations')),
    adminUrl: getEnv('ADMIN_DATABASE_URL', 'postgres://postgres:postgres_dev_password@127.0.0.1:5435/operations'),
    backupUrl: getEnv('BACKUP_DATABASE_URL', 'postgres://app_backup:backup_dev_password@127.0.0.1:5435/operations'),
    poolMax: getIntEnv('POOL_MAX', 10),
    workerPoolMax: getIntEnv('WORKER_POOL_MAX', 3),
    statementTimeout: getIntEnv('DB_STATEMENT_TIMEOUT_MS', 5000),
    lockTimeout: getIntEnv('DB_LOCK_TIMEOUT_MS', 3000),
  },

  workflow: {
    mergeMaxGap: getIntEnv('MERGE_MAX_GAP', 10),
  },

  outbox: {
    batchSize: getIntEnv('OUTBOX_BATCH_SIZE', 10),
    leaseSeconds: getIntEnv('OUTBOX_LEASE_SECONDS', 60),
    maxAttempts: getIntEnv('OUTBOX_MAX_ATTEMPTS', 5),
    pollIntervalMs: getIntEnv('OUTBOX_POLL_INTERVAL_MS', 1000),
  },

  ws: {
    maxConnectionsPerUser: getIntEnv('WS_MAX_CONNECTIONS_PER_USER', 5),
    maxConnectionsTotal: getIntEnv('WS_MAX_CONNECTIONS_TOTAL', 5000),
    heartbeatIntervalMs: getIntEnv('WS_HEARTBEAT_INTERVAL_MS', 25000),
    sessionRevalidateMs: getIntEnv('WS_SESSION_REVALIDATE_MS', 30000),
  }
};
