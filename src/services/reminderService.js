// src/services/reminderService.js
import { logger } from '../shared/logger.js';

/**
 * Evaluates active work items with deadlines (due_at).
 * Emits:
 * 1. 'deadline_approaching': When due_at is within the threshold window (default 24h) and still in the future.
 * 2. 'deadline_overdue': When due_at has passed and the work item is still unresolved.
 *
 * Scoped to active statuses: open, in_progress, pending_approval.
 * Deduplicated via unique index uq_notifications_deadline_reminder so users receive at most
 * one approaching and one overdue notification per deadline cycle.
 *
 * @param {import('pg').Pool|import('pg').PoolClient} clientOrPool
 * @param {object} [options]
 * @param {number} [options.approachingHours=24]
 * @returns {Promise<{ created: number, approachingCount: number, overdueCount: number }>}
 */
export async function processDeadlineReminders(clientOrPool, options = {}) {
  const approachingHours = options.approachingHours || 24;

  try {
    // 1. Fetch work items approaching deadline (within approachingHours and in future)
    const { rows: approachingItems } = await clientOrPool.query(
      `SELECT w.id, w.team_id, w.number, w.title, w.due_at, w.assignee_id, w.requested_by, w.created_by, w.priority,
              t.key AS team_key
       FROM work_items w
       JOIN teams t ON t.id = w.team_id
       WHERE w.status IN ('open', 'in_progress', 'pending_approval')
         AND w.due_at IS NOT NULL
         AND w.due_at > now()
         AND w.due_at <= now() + ($1 || ' hours')::interval`,
      [approachingHours]
    );

    // 2. Fetch work items overdue (due_at <= now)
    const { rows: overdueItems } = await clientOrPool.query(
      `SELECT w.id, w.team_id, w.number, w.title, w.due_at, w.assignee_id, w.requested_by, w.created_by, w.priority,
              t.key AS team_key
       FROM work_items w
       JOIN teams t ON t.id = w.team_id
       WHERE w.status IN ('open', 'in_progress', 'pending_approval')
         AND w.due_at IS NOT NULL
         AND w.due_at <= now()`
    );

    let created = 0;

    // Helper to send reminder notifications for an item and a specific reminder kind
    const sendReminders = async (item, kind) => {
      // Find recipients:
      // - Assignee if present
      // - Creator / requester
      // - All active team leads
      const recipientIds = new Set();
      if (item.assignee_id) recipientIds.add(String(item.assignee_id));
      if (item.requested_by) recipientIds.add(String(item.requested_by));
      if (item.created_by) recipientIds.add(String(item.created_by));

      // Also notify team leads
      const { rows: leadRows } = await clientOrPool.query(
        `SELECT user_id FROM team_memberships
         WHERE team_id = $1 AND role = 'lead' AND removed_at IS NULL`,
        [item.team_id]
      );
      for (const lead of leadRows) {
        recipientIds.add(String(lead.user_id));
      }

      for (const userId of recipientIds) {
        const { rows } = await clientOrPool.query(
          `INSERT INTO notifications (user_id, work_item_id, team_id, kind)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, work_item_id, kind)
           WHERE kind IN ('deadline_approaching', 'deadline_overdue')
           DO NOTHING
           RETURNING id`,
          [userId, item.id, item.team_id, kind]
        );

        if (rows.length > 0) {
          created++;
          // Notify via PostgreSQL LISTEN/NOTIFY for real-time websocket delivery
          await clientOrPool.query(`SELECT pg_notify('user_notifications', $1)`, [userId]);
        }
      }
    };

    for (const item of approachingItems) {
      await sendReminders(item, 'deadline_approaching');
    }

    for (const item of overdueItems) {
      await sendReminders(item, 'deadline_overdue');
    }

    if (created > 0) {
      logger.info({ created, approaching: approachingItems.length, overdue: overdueItems.length }, 'Dispatched deadline reminder notifications');
    }

    return {
      created,
      approachingCount: approachingItems.length,
      overdueCount: overdueItems.length
    };
  } catch (err) {
    logger.error({ err }, 'Error processing deadline reminders');
    return { created: 0, approachingCount: 0, overdueCount: 0 };
  }
}

/**
 * Reset deadline notifications when an item's due_at timestamp is modified
 */
export async function clearDeadlineRemindersForItem(clientOrPool, workItemId) {
  try {
    await clientOrPool.query(
      `DELETE FROM notifications
       WHERE work_item_id = $1 AND kind IN ('deadline_approaching', 'deadline_overdue')`,
      [workItemId]
    );
  } catch (err) {
    logger.error({ err, workItemId }, 'Failed to clear deadline reminders for work item');
  }
}

/**
 * Mark any pending deadline notifications as read when an item is resolved or closed
 */
export async function markDeadlineRemindersReadForItem(clientOrPool, workItemId) {
  try {
    await clientOrPool.query(
      `UPDATE notifications
       SET read_at = now()
       WHERE work_item_id = $1
         AND kind IN ('deadline_approaching', 'deadline_overdue')
         AND read_at IS NULL`,
      [workItemId]
    );
  } catch (err) {
    logger.error({ err, workItemId }, 'Failed to mark deadline reminders read for work item');
  }
}
