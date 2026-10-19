// test/deadlines.test.js
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { getTestApp, resetDatabase, loginAs, authHeaders } from './testHelper.js';
import { pool } from '../src/db/pool.js';
import { processDeadlineReminders } from '../src/services/reminderService.js';

describe('Work Item Deadlines & Automated Reminder Notifications', () => {
  let app;
  let alice; // Team 1 Lead
  let charlie; // Team 1 Member

  beforeAll(async () => {
    app = await getTestApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    alice = await loginAs(app, 'alice@newtonite.test');
    charlie = await loginAs(app, 'charlie@newtonite.test');
  });

  it('1. Creates a work item with a deadline in 2 hours and triggers "deadline_approaching" reminder', async () => {
    const twoHoursFromNow = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    // Alice creates work item with due_at in 2 hours
    const createRes = await app.inject({
      method: 'POST',
      url: '/teams/1/work-items',
      headers: authHeaders(alice.cookieHeader, crypto.randomUUID()),
      payload: {
        title: 'Impending Service Degradation',
        description: 'Memory usage approaching capacity limit',
        kind: 'incident',
        priority: 3,
        due_at: twoHoursFromNow
      }
    });

    expect(createRes.statusCode).toBe(201);
    const item = createRes.json();
    expect(item.id).toBeDefined();
    expect(item.due_at).toBeDefined();

    // Charlie claims the item
    const claimRes = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/claim`,
      headers: authHeaders(charlie.cookieHeader, crypto.randomUUID())
    });
    expect(claimRes.statusCode).toBe(200);

    // Trigger deadline reminder processing
    const reminderResult = await processDeadlineReminders(pool);
    expect(reminderResult.created).toBeGreaterThanOrEqual(1);

    // Charlie checks his notifications inbox
    const notifRes = await app.inject({
      method: 'GET',
      url: '/notifications',
      headers: authHeaders(charlie.cookieHeader)
    });

    expect(notifRes.statusCode).toBe(200);
    const notifications = notifRes.json().notifications;
    const deadlineNotif = notifications.find(
      (n) => String(n.work_item_id) === String(item.id) && n.kind === 'deadline_approaching'
    );

    expect(deadlineNotif).toBeDefined();
    expect(deadlineNotif.actor_name).toBe('Deadline Reminder');
    expect(deadlineNotif.event_type).toBe('deadline_approaching');
    expect(deadlineNotif.item_title).toBe('Impending Service Degradation');
    expect(deadlineNotif.team_key).toBe('OPS');
  });

  it('2. Enforces deduplication so reminder notifications are not spammed repeatedly', async () => {
    const fourHoursFromNow = new Date(Date.now() + 4 * 3600 * 1000).toISOString();

    const createRes = await app.inject({
      method: 'POST',
      url: '/teams/1/work-items',
      headers: authHeaders(alice.cookieHeader, crypto.randomUUID()),
      payload: {
        title: 'Single Alert Invariant Check',
        kind: 'task',
        priority: 2,
        due_at: fourHoursFromNow
      }
    });
    const item = createRes.json();

    // First reminder run creates notification
    const firstRun = await processDeadlineReminders(pool);
    expect(firstRun.created).toBeGreaterThanOrEqual(1);

    // Second reminder run immediately afterwards creates 0 duplicates
    const secondRun = await processDeadlineReminders(pool);
    expect(secondRun.created).toBe(0);

    // Check count of notifications for this item
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt FROM notifications
       WHERE work_item_id = $1 AND kind = 'deadline_approaching'`,
      [item.id]
    );
    // Alice (creator and lead) receives at most 1 notification
    expect(parseInt(rows[0].cnt, 10)).toBeGreaterThan(0);
  });

  it('3. Triggers "deadline_overdue" notification for items that have passed their deadline', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();

    const createRes = await app.inject({
      method: 'POST',
      url: '/teams/1/work-items',
      headers: authHeaders(alice.cookieHeader, crypto.randomUUID()),
      payload: {
        title: 'Past SLA Gateway Bug',
        kind: 'incident',
        priority: 4,
        due_at: twoHoursAgo
      }
    });
    const item = createRes.json();

    // Trigger deadline reminder processing
    await processDeadlineReminders(pool);

    // Verify notification
    const { rows } = await pool.query(
      `SELECT * FROM notifications
       WHERE work_item_id = $1 AND kind = 'deadline_overdue'`,
      [item.id]
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].kind).toBe('deadline_overdue');
  });

  it('4. Updating due_at deadline resets alerts and allows new reminder', async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000).toISOString();

    const createRes = await app.inject({
      method: 'POST',
      url: '/teams/1/work-items',
      headers: authHeaders(alice.cookieHeader, crypto.randomUUID()),
      payload: {
        title: 'Deadline Extension Test',
        kind: 'task',
        priority: 1,
        due_at: pastDate
      }
    });
    const item = createRes.json();

    // Trigger overdue alert
    await processDeadlineReminders(pool);

    const { rows: initialNotifs } = await pool.query(
      `SELECT id FROM notifications WHERE work_item_id = $1 AND kind = 'deadline_overdue'`,
      [item.id]
    );
    expect(initialNotifs.length).toBeGreaterThan(0);

    // Lead extends deadline to 5 hours in the future
    const newDueDate = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/work-items/${item.id}`,
      headers: authHeaders(alice.cookieHeader, crypto.randomUUID()),
      payload: {
        expected_version: item.version,
        due_at: newDueDate
      }
    });
    expect(patchRes.statusCode).toBe(200);

    // Old overdue notification was cleared
    const { rows: clearedNotifs } = await pool.query(
      `SELECT id FROM notifications WHERE work_item_id = $1 AND kind = 'deadline_overdue'`,
      [item.id]
    );
    expect(clearedNotifs.length).toBe(0);

    // Next reminder run generates 'deadline_approaching' for the new target
    const nextRun = await processDeadlineReminders(pool);
    expect(nextRun.created).toBeGreaterThanOrEqual(1);

    const { rows: newNotifs } = await pool.query(
      `SELECT id, kind FROM notifications WHERE work_item_id = $1`,
      [item.id]
    );
    expect(newNotifs.some((n) => n.kind === 'deadline_approaching')).toBe(true);
  });

  it('5. Resolving an item automatically marks pending deadline notifications as read', async () => {
    const twoHoursFromNow = new Date(Date.now() + 2 * 3600 * 1000).toISOString();

    const createRes = await app.inject({
      method: 'POST',
      url: '/teams/1/work-items',
      headers: authHeaders(alice.cookieHeader, crypto.randomUUID()),
      payload: {
        title: 'Fast Resolved Incident',
        kind: 'incident',
        priority: 2,
        due_at: twoHoursFromNow,
        requires_approval: false
      }
    });
    const item = createRes.json();

    // Charlie claims the item
    await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/claim`,
      headers: authHeaders(charlie.cookieHeader, crypto.randomUUID())
    });

    // Trigger approaching reminders
    await processDeadlineReminders(pool);

    // Verify unread reminders exist
    const { rows: unreadBefore } = await pool.query(
      `SELECT id FROM notifications
       WHERE work_item_id = $1 AND kind = 'deadline_approaching' AND read_at IS NULL`,
      [item.id]
    );
    expect(unreadBefore.length).toBeGreaterThan(0);

    // Charlie resolves the item (now at version 2)
    const resolveRes = await app.inject({
      method: 'POST',
      url: `/work-items/${item.id}/transition`,
      headers: authHeaders(charlie.cookieHeader, crypto.randomUUID()),
      payload: { action: 'resolve', expected_version: 2 }
    });
    expect(resolveRes.statusCode).toBe(200);

    // Verify deadline notifications are marked as read
    const { rows: unreadAfter } = await pool.query(
      `SELECT id FROM notifications
       WHERE work_item_id = $1 AND kind = 'deadline_approaching' AND read_at IS NULL`,
      [item.id]
    );
    expect(unreadAfter.length).toBe(0);
  });
});
