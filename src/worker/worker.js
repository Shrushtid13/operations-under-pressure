// src/worker/worker.js
import crypto from 'node:crypto';
import { workerPool, withTransaction } from '../db/pool.js';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { processDeadlineReminders } from '../services/reminderService.js';

let isRunning = true;

/**
 * Determine recipient user IDs for an event
 */
async function resolveRecipients(client, eventId, eventType, workItemId, teamId, actorId) {
  const recipients = new Set();

  // Load work item details
  const { rows: itemRows } = await client.query(
    `SELECT assignee_id, created_by, requested_by, approval_requested_by
     FROM work_items WHERE id = $1`,
    [workItemId]
  );

  if (itemRows.length > 0) {
    const item = itemRows[0];
    if (item.created_by) recipients.add(String(item.created_by));
    if (item.assignee_id) recipients.add(String(item.assignee_id));
  }

  // Load all co-assignees from work_item_assignees
  const { rows: assigneeRows } = await client.query(
    `SELECT user_id FROM work_item_assignees WHERE work_item_id = $1`,
    [workItemId]
  );
  for (const a of assigneeRows) {
    recipients.add(String(a.user_id));
  }

  // Load previous assignee or other actors from event payload if available
  const { rows: eventRows } = await client.query(
    `SELECT payload FROM work_item_events WHERE id = $1`,
    [eventId]
  );
  if (eventRows.length > 0 && eventRows[0].payload) {
    const payload = eventRows[0].payload;
    if (payload.from) recipients.add(String(payload.from));
    if (payload.previous_assignee) recipients.add(String(payload.previous_assignee));
  }

  // For approval_requested, notify all leads of the team
  if (eventType === 'work_item.approval_requested') {
    const { rows: leadRows } = await client.query(
      `SELECT user_id FROM team_memberships
       WHERE team_id = $1 AND role = 'lead' AND removed_at IS NULL`,
      [teamId]
    );
    for (const lead of leadRows) {
      recipients.add(String(lead.user_id));
    }
  }

  // Never notify the actor who performed the action
  if (actorId) {
    recipients.delete(String(actorId));
  }

  return Array.from(recipients);
}

/**
 * Single poll & process cycle
 */
async function processBatch() {
  const leaseToken = crypto.randomUUID();
  const maxAttempts = config.outbox.maxAttempts;
  const batchSize = config.outbox.batchSize;
  const leaseSeconds = config.outbox.leaseSeconds;

  // Phase 1: Claim batch and commit immediately
  let claimedRows = [];
  try {
    const { rows } = await workerPool.query(
      `UPDATE outbox
       SET lease_token = $1,
           locked_until = now() + ($2 || ' seconds')::interval,
           attempts = attempts + 1
       WHERE id IN (
         SELECT id FROM outbox
         WHERE status = 'pending'
           AND available_at <= now()
           AND (locked_until IS NULL OR locked_until < now())
           AND attempts < $3
         ORDER BY available_at ASC
         LIMIT $4
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      [leaseToken, leaseSeconds, maxAttempts, batchSize]
    );
    claimedRows = rows;
  } catch (err) {
    logger.error({ err }, 'Outbox claim query failed');
    return 0;
  }

  if (claimedRows.length === 0) {
    return 0;
  }

  logger.debug({ count: claimedRows.length }, 'Claimed outbox batch');

  // Phase 2 & 3: Process outside claim transaction, acknowledge in separate transactions
  for (const row of claimedRows) {
    try {
      const payload = row.payload || {};
      const { work_item_id, team_id, actor_id } = payload;

      // Execute acknowledgement and notification insertion in a dedicated transaction
      await withTransaction(async (client) => {
        // Resolve recipients
        const recipientUserIds = await resolveRecipients(
          client,
          row.event_id,
          row.type,
          work_item_id,
          team_id,
          actor_id
        );

        // Insert deduplicated notifications
        for (const userId of recipientUserIds) {
          await client.query(
            `INSERT INTO notifications (user_id, work_item_id, event_id, kind)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (user_id, event_id, kind) DO NOTHING`,
            [userId, work_item_id, row.event_id, row.type]
          );

          // Emit notification hint for user
          await client.query(`SELECT pg_notify('user_notifications', $1)`, [userId]);
        }

        // Acknowledge outbox row
        const { rowCount } = await client.query(
          `UPDATE outbox
           SET status = 'done', done_at = now(), lease_token = NULL, locked_until = NULL
           WHERE id = $1 AND lease_token = $2`,
          [row.id, leaseToken]
        );

        if (rowCount === 0) {
          // Lease expired and claimed by another worker; roll back notifications
          throw new Error(`Outbox lease lost for row ${row.id}`);
        }
      }, workerPool);

      logger.debug({ outboxId: row.id, type: row.type }, 'Outbox message processed successfully');
    } catch (err) {
      logger.warn({ outboxId: row.id, attempts: row.attempts, err: err.message }, 'Outbox message processing failed');

      // Failure backoff calculation: LEAST(5s * 2^attempts, 15m)
      const backoffSeconds = Math.min(5 * Math.pow(2, row.attempts), 900);
      const isDead = row.attempts >= maxAttempts;

      try {
        await workerPool.query(
          `UPDATE outbox
           SET available_at = now() + ($1 || ' seconds')::interval,
               last_error = $2,
               lease_token = NULL,
               locked_until = NULL,
               status = CASE WHEN attempts >= $3 THEN 'dead' ELSE 'pending' END
           WHERE id = $4 AND lease_token = $5`,
          [backoffSeconds, (err.message || 'Error').slice(0, 1000), maxAttempts, row.id, leaseToken]
        );
      } catch (updateErr) {
        logger.error({ updateErr, outboxId: row.id }, 'Failed to record outbox failure state');
      }
    }
  }

  return claimedRows.length;
}

/**
 * Reaper for stalled rows whose worker crashed before failure handler ran
 */
async function runReaper() {
  try {
    const { rowCount } = await workerPool.query(
      `UPDATE outbox
       SET status = 'dead', lease_token = NULL, locked_until = NULL
       WHERE status = 'pending'
         AND attempts >= $1
         AND (locked_until IS NULL OR locked_until < now())`,
      [config.outbox.maxAttempts]
    );
    if (rowCount > 0) {
      logger.warn({ count: rowCount }, 'Reaper marked dead outbox rows');
    }
  } catch (err) {
    logger.error({ err }, 'Reaper run failed');
  }
}

/**
 * Periodic cleanup of expired records (§10.2, §4)
 */
async function runCleanup() {
  try {
    // 1. Expired idempotency keys (> 24 hours old)
    const { rowCount: cleanedKeys } = await workerPool.query(
      `DELETE FROM idempotency_keys WHERE created_at < now() - interval '24 hours'`
    );

    // 2. Long-expired sessions (> 7 days after absolute expiration)
    const { rowCount: cleanedSessions } = await workerPool.query(
      `DELETE FROM sessions WHERE expires_at < now() - interval '7 days'`
    );

    // 3. Old done outbox entries (> 7 days old)
    const { rowCount: cleanedOutbox } = await workerPool.query(
      `DELETE FROM outbox WHERE status = 'done' AND done_at < now() - interval '7 days'`
    );

    if (cleanedKeys > 0 || cleanedSessions > 0 || cleanedOutbox > 0) {
      logger.info({ cleanedKeys, cleanedSessions, cleanedOutbox }, 'Periodic cleanup completed');
    }
  } catch (err) {
    logger.error({ err }, 'Cleanup run failed');
  }
}

/**
 * Worker Main Loop
 */
export async function startWorker() {
  logger.info('Outbox background worker started');

  let lastReaper = Date.now();
  let lastCleanup = Date.now();
  let lastDeadlines = 0;

  while (isRunning) {
    try {
      const processedCount = await processBatch();

      const now = Date.now();
      // Run deadline reminder checks every 20 seconds
      if (now - lastDeadlines > 20000) {
        await processDeadlineReminders(workerPool);
        lastDeadlines = now;
      }

      // Run reaper every 60 seconds
      if (now - lastReaper > 60000) {
        await runReaper();
        lastReaper = now;
      }

      // Run cleanup every 10 minutes
      if (now - lastCleanup > 600000) {
        await runCleanup();
        lastCleanup = now;
      }

      // If we processed a full batch, check immediately again; otherwise pause
      if (processedCount < config.outbox.batchSize) {
        await new Promise((resolve) => setTimeout(resolve, config.outbox.pollIntervalMs));
      }
    } catch (err) {
      logger.error({ err }, 'Unhandled error in worker loop');
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  logger.info('Outbox worker shutting down gracefully');
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, worker stopping...');
  isRunning = false;
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, worker stopping...');
  isRunning = false;
});

if (process.argv[1] && process.argv[1].endsWith('worker.js')) {
  startWorker()
    .then(() => process.exit(0))
    .catch((err) => {
      logger.fatal({ err }, 'Worker fatal exit');
      process.exit(1);
    });
}
