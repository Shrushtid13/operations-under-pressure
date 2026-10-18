// scripts/backup.js
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { config } from '../src/shared/config.js';
import { logger } from '../src/shared/logger.js';

const execFileAsync = promisify(execFile);
const BACKUPS_DIR = path.resolve('backups');
const MAX_BACKUPS = 7;

export async function createBackup() {
  await fs.mkdir(BACKUPS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFileName = `operations-backup-${timestamp}.dump`;
  const backupFilePath = path.join(BACKUPS_DIR, backupFileName);
  const checksumFilePath = `${backupFilePath}.sha256`;

  logger.info({ backupFilePath }, 'Starting database logical backup...');

  // Use docker exec to run pg_dump inside operations_db container to guarantee pg_dump availability
  // Connecting as app_backup
  const args = [
    'exec',
    '-e', 'PGPASSWORD=backup_dev_password',
    'operations_db',
    'pg_dump',
    '-U', 'app_backup',
    '-d', 'operations',
    '--format=custom',
    '--no-owner'
  ];

  try {
    const { stdout } = await execFileAsync('docker', args, { encoding: 'buffer', maxBuffer: 100 * 1024 * 1024 });
    await fs.writeFile(backupFilePath, stdout);

    // Compute SHA-256 checksum
    const hash = crypto.createHash('sha256').update(stdout).digest('hex');
    await fs.writeFile(checksumFilePath, `${hash}  ${backupFileName}\n`, 'utf-8');

    const stats = await fs.stat(backupFilePath);
    logger.info({
      file: backupFileName,
      sizeBytes: stats.size,
      sha256: hash
    }, 'Database backup and checksum written successfully');

    // Manage retention: prune older than MAX_BACKUPS
    const files = await fs.readdir(BACKUPS_DIR);
    const dumpFiles = files.filter((f) => f.endsWith('.dump')).sort();

    if (dumpFiles.length > MAX_BACKUPS) {
      const toDelete = dumpFiles.slice(0, dumpFiles.length - MAX_BACKUPS);
      for (const oldFile of toDelete) {
        await fs.unlink(path.join(BACKUPS_DIR, oldFile)).catch(() => {});
        await fs.unlink(path.join(BACKUPS_DIR, `${oldFile}.sha256`)).catch(() => {});
        logger.info({ oldFile }, 'Pruned old backup file per retention policy');
      }
    }

    return { filePath: backupFilePath, hash, size: stats.size };
  } catch (err) {
    logger.error({ err }, 'Backup failed');
    throw err;
  }
}

if (process.argv[1] && process.argv[1].endsWith('backup.js')) {
  createBackup()
    .then((res) => {
      console.log(`Backup completed: ${res.filePath} (${res.size} bytes) SHA-256: ${res.hash}`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Backup error:', err);
      process.exit(1);
    });
}
