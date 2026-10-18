// src/db/pool.js
import pg from 'pg';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { serviceUnavailable } from '../shared/errors.js';

const { Pool, types } = pg;

// Ensure 64-bit int8 is parsed as string to prevent JS float precision loss
types.setTypeParser(20, (val) => val);

export const pool = new Pool({
  connectionString: config.db.runtimeUrl,
  max: config.db.poolMax,
  connectionTimeoutMillis: 3000,
  idleTimeoutMillis: 30000,
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on idle PostgreSQL client');
});

export const migratorPool = new Pool({
  connectionString: config.db.migratorUrl,
  max: 2,
  connectionTimeoutMillis: 5000,
});

migratorPool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on migrator PostgreSQL client');
});

export const workerPool = new Pool({
  connectionString: config.db.runtimeUrl,
  max: config.db.workerPoolMax,
  connectionTimeoutMillis: 5000,
});

workerPool.on('error', (err) => {
  logger.error({ err }, 'Unexpected error on worker PostgreSQL client');
});

/**
 * Executes a callback within a managed transaction.
 * Automatically configures statement_timeout and lock_timeout.
 * Maps deadlocks (40P01) and query cancellations/timeouts (57014) to 503 retryable errors.
 */
export async function withTransaction(callback, clientPool = pool) {
  let client;
  try {
    client = await clientPool.connect();
  } catch (err) {
    logger.error({ err }, 'Failed to acquire DB connection from pool');
    throw serviceUnavailable('Database connection unavailable');
  }

  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${config.db.statementTimeout}`);
    await client.query(`SET LOCAL lock_timeout = ${config.db.lockTimeout}`);

    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackErr) {
      logger.error({ rollbackErr }, 'Failed to rollback transaction');
    }

    // PostgreSQL error codes:
    // 40P01 = deadlock_detected
    // 57014 = query_canceled (statement timeout)
    // 55P03 = lock_not_available (lock timeout)
    // 08006 / 08001 / 08004 = connection failure
    if (['40P01', '57014', '55P03', '08006', '08001', '08004'].includes(err.code)) {
      logger.warn({ errCode: err.code, message: err.message }, 'Database transient failure, wrapping as 503');
      throw serviceUnavailable(`Database transaction interrupted: ${err.message}`);
    }

    throw err;
  } finally {
    client.release();
  }
}
