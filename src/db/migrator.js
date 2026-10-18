// src/db/migrator.js
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migratorPool } from './pool.js';
import { logger } from '../shared/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

export async function runMigrations() {
  logger.info('Starting database migrations as app_migrator...');
  const client = await migratorPool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    const { rows: appliedRows } = await client.query('SELECT name FROM schema_migrations ORDER BY name');
    const appliedSet = new Set(appliedRows.map((r) => r.name));

    const files = await fs.readdir(MIGRATIONS_DIR);
    const sqlFiles = files.filter((f) => f.endsWith('.sql')).sort();

    for (const file of sqlFiles) {
      if (appliedSet.has(file)) {
        logger.debug({ file }, 'Migration already applied, skipping');
        continue;
      }

      logger.info({ file }, 'Applying migration...');
      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = await fs.readFile(filePath, 'utf-8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
        logger.info({ file }, 'Successfully applied migration');
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error({ file, err }, 'Failed to apply migration, rolled back');
        throw err;
      }
    }

    logger.info('All migrations up to date.');
  } finally {
    client.release();
  }
}

// Run if called directly
if (process.argv[1] && process.argv[1].endsWith('migrator.js')) {
  runMigrations()
    .then(() => {
      logger.info('Migration run finished');
      process.exit(0);
    })
    .catch((err) => {
      logger.fatal({ err }, 'Migration failed');
      process.exit(1);
    });
}
