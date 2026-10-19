// src/services/commands.js
import crypto from 'node:crypto';
import { withTransaction, pool } from '../db/pool.js';
import { assertCan, getTeamRole } from './policy.js';
import { config } from '../shared/config.js';
import {
  AppError,
  notFound,
  forbidden,
  validationError,
  idempotencyKeyRequired,
  idempotencyKeyReused,
  versionConflict,
  alreadyAssigned,
  invalidTransition,
  approverMustDiffer,
  invalidAssignee
} from '../shared/errors.js';
import { logger } from '../shared/logger.js';
import { clearDeadlineRemindersForItem, markDeadlineRemindersReadForItem } from './reminderService.js';

export function canonicalJsonHash(method, path, body) {
  const normalizedBody = body ? JSON.stringify(body, Object.keys(body).sort()) : '';
  const payload = `${method.toUpperCase()}:${path}:${normalizedBody}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Base orchestrator executing commands with Idempotency and Transaction guarantees (§4)
 */
export async function executeCommand(user, idempotencyKey, requestMeta, commandFn) {
  if (!idempotencyKey) {
    throw idempotencyKeyRequired();
  }

  // Idempotency Key validation (§10.4: <= 128 chars, [A-Za-z0-9_-])
  if (typeof idempotencyKey !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(idempotencyKey)) {
    throw validationError('Invalid Idempotency-Key header format');
  }

  const reqHash = canonicalJsonHash(requestMeta.method, requestMeta.path, requestMeta.body);

  return await withTransaction(async (client) => {
    // 1. Attempt to claim the idempotency key in the owning transaction
    const { rowCount } = await client.query(
      `INSERT INTO idempotency_keys (user_id, key, request_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO NOTHING`,
      [user.id, idempotencyKey, reqHash]
    );

    if (rowCount === 0) {
      // Key already exists; read winner's committed response
      const { rows } = await client.query(
        `SELECT request_hash, response_status, response_body
         FROM idempotency_keys
         WHERE user_id = $1 AND key = $2`,
        [user.id, idempotencyKey]
      );

      const existing = rows[0];
      if (!existing) {
        throw new AppError(500, 'IDEMPOTENCY_ERROR', 'Idempotency key state conflict');
      }

      if (existing.request_hash !== reqHash) {
        throw idempotencyKeyReused();
      }

      // Replay stored response verbatim (without re-judging state or version)
      return {
        status: existing.response_status || 200,
        body: existing.response_body,
        isReplay: true
      };
    }

    // 2. We own the key: execute command
    const result = await commandFn(client);

    const responseStatus = result.status || 200;
    const responseBody = result.body !== undefined ? result.body : result;

    // 3. Store response before commit
    await client.query(
      `UPDATE idempotency_keys
       SET response_status = $1, response_body = $2
       WHERE user_id = $3 AND key = $4`,
      [responseStatus, JSON.stringify(responseBody), user.id, idempotencyKey]
    );

    return {
      status: responseStatus,
      body: responseBody,
      isReplay: false
    };
  });
}

/**
 * Helper to emit WebSocket notification hint via pg_notify
 */
async function notifyItemChanged(client, teamId, itemId, version, eventSeq, extra = {}) {
  const payload = JSON.stringify({
    type: 'item',
    team_id: String(teamId),
    item_id: String(itemId),
    version: Number(version),
    event_seq: Number(eventSeq),
    ...extra
  });
  await client.query(`SELECT pg_notify('item_changes', $1)`, [payload]);
}

/**
 * CREATE Work Item
 */
export async function createWorkItem(user, teamId, data, requestId, client) {
  // 1. Team lock FOR UPDATE (rank 1 of locking protocol)
  const { rows: teamRows } = await client.query(
    `SELECT id, key, next_item_number FROM teams WHERE id = $1 FOR UPDATE`,
    [teamId]
  );
  if (!teamRows.length) throw notFound('Team not found');

  // 2. Check create authorization
  await assertCan(user, 'create', null, { teamId, forShare: true }, client);

  // 3. Validate body fields
  const { title, description, kind, priority, due_at, requires_approval } = data;
  if (!title || typeof title !== 'string' || title.length > 200) {
    throw validationError('Title is required and must be at most 200 characters');
  }
  if (!['customer_issue', 'incident', 'payment', 'compliance', 'task'].includes(kind)) {
    throw validationError('Invalid work item kind');
  }
  if (![1, 2, 3, 4].includes(priority)) {
    throw validationError('Priority must be between 1 and 4');
  }

  // 4. Allocate number atomically
  const { rows: allocRows } = await client.query(
    `UPDATE teams SET next_item_number = next_item_number + 1 WHERE id = $1 RETURNING next_item_number - 1 AS number, key`,
    [teamId]
  );
  const { number, key } = allocRows[0];

  // 5. Insert work item
  const { rows: itemRows } = await client.query(
    `INSERT INTO work_items (
      team_id, number, kind, title, description, status, priority,
      assignee_id, requested_by, requires_approval, due_at,
      version, event_seq, created_by, last_activity_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, 'open', $6,
      NULL, $7, $8, $9,
      1, 1, $7, now(), now()
    ) RETURNING *`,
    [
      teamId, number, kind, title, description || null, priority,
      user.id, Boolean(requires_approval), due_at ? new Date(due_at) : null
    ]
  );

  const item = itemRows[0];

  // 6. Insert created event (seq=1, item_version=1)
  const { rows: eventRows } = await client.query(
    `INSERT INTO work_item_events (
      work_item_id, seq, item_version, actor_id, type, payload, request_id
    ) VALUES ($1, 1, 1, $2, 'created', $3, $4) RETURNING id`,
    [item.id, user.id, JSON.stringify({ title, kind, priority, requires_approval: item.requires_approval }), requestId]
  );

  // 7. Insert outbox row
  await client.query(
    `INSERT INTO outbox (event_id, type, payload, status)
     VALUES ($1, 'work_item.created', $2, 'pending')`,
    [eventRows[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]
  );

  // 8. WebSocket hint
  await notifyItemChanged(client, item.team_id, item.id, 1, 1);

  return { status: 201, body: item };
}

/**
 * CLAIM Work Item (Conditional UPDATE with 409 winner resolution)
 */
export async function claimWorkItem(user, itemId, requestId, client) {
  // Read current item to verify team and role
  const { rows: existingRows } = await client.query(
    `SELECT * FROM work_items WHERE id = $1`,
    [itemId]
  );
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  // Authorization check
  await assertCan(user, 'claim', existing, { forShare: true }, client);

  // Atomic conditional update
  const { rows: updatedRows } = await client.query(
    `UPDATE work_items
     SET assignee_id = $1, status = 'in_progress', version = version + 1,
         event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
     WHERE id = $2 AND status = 'open' AND assignee_id IS NULL
     RETURNING *`,
    [user.id, itemId]
  );

  if (updatedRows.length > 0) {
    const item = updatedRows[0];

    const { rows: eventRows } = await client.query(
      `INSERT INTO work_item_events (
        work_item_id, seq, item_version, actor_id, type, payload, request_id
      ) VALUES ($1, $2, $3, $4, 'assigned', $5, $6) RETURNING id`,
      [item.id, item.event_seq, item.version, user.id, JSON.stringify({ from: null, to: user.id, action: 'claim' }), requestId]
    );

    await client.query(
      `INSERT INTO outbox (event_id, type, payload, status)
       VALUES ($1, 'work_item.assigned', $2, 'pending')`,
      [eventRows[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]
    );

    await client.query(
      `INSERT INTO work_item_assignees (work_item_id, user_id, assigned_by)
       VALUES ($1, $2, $2)
       ON CONFLICT (work_item_id, user_id) DO NOTHING`,
      [item.id, user.id]
    );

    await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
      actor_id: user.id,
      actor_name: user.name,
      changed_fields: ['assignee_id', 'status']
    });
    return { status: 200, body: item };
  }

  // If conditional UPDATE matched 0 rows, re-read under read-committed to decide response by status
  const { rows: reReadRows } = await client.query(
    `SELECT w.*, u.name as assignee_name, u.email as assignee_email
     FROM work_items w
     LEFT JOIN users u ON u.id = w.assignee_id
     WHERE w.id = $1`,
    [itemId]
  );
  const current = reReadRows[0];

  if (current.status === 'in_progress' && String(current.assignee_id) === String(user.id)) {
    // Current assignee reclaiming their own item -> 200 no-op, store in idempotency
    return { status: 200, body: current };
  }

  if (current.status === 'in_progress' && String(current.assignee_id) !== String(user.id)) {
    throw alreadyAssigned(
      `Item was already claimed by ${current.assignee_name || 'another team member'}`,
      current,
      { id: current.assignee_id, name: current.assignee_name, email: current.assignee_email }
    );
  }

  throw invalidTransition(`Cannot claim item in status "${current.status}"`);
}

/**
 * RELEASE Work Item
 */
export async function releaseWorkItem(user, itemId, expectedVersion, requestId, client) {
  const { rows: existingRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  await assertCan(user, 'release', existing, { forShare: true }, client);

  const { rows: updatedRows } = await client.query(
    `UPDATE work_items
     SET assignee_id = NULL, status = 'open', version = version + 1,
         event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
     WHERE id = $1 AND version = $2 AND status = 'in_progress' AND assignee_id = $3
     RETURNING *`,
    [itemId, expectedVersion, user.id]
  );

  if (updatedRows.length > 0) {
    const item = updatedRows[0];

    const { rows: eventRows } = await client.query(
      `INSERT INTO work_item_events (
        work_item_id, seq, item_version, actor_id, type, payload, request_id
      ) VALUES ($1, $2, $3, $4, 'released', $5, $6) RETURNING id`,
      [item.id, item.event_seq, item.version, user.id, JSON.stringify({ from: user.id }), requestId]
    );

    await client.query(
      `INSERT INTO outbox (event_id, type, payload, status)
       VALUES ($1, 'work_item.released', $2, 'pending')`,
      [eventRows[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]
    );

    await client.query(
      `DELETE FROM work_item_assignees WHERE work_item_id = $1 AND user_id = $2`,
      [item.id, user.id]
    );

    await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
      actor_id: user.id,
      actor_name: user.name,
      changed_fields: ['assignee_id', 'status']
    });
    return { status: 200, body: item };
  }

  const { rows: currentRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  const current = currentRows[0];

  if (current.version !== Number(expectedVersion)) {
    throw versionConflict('Item was modified by another operation', current);
  }

  throw invalidTransition(`Cannot release item in status "${current.status}"`);
}

/**
 * ASSIGN Work Item (Lead only)
 */
export async function assignWorkItem(user, itemId, targetAssigneeId, expectedVersion, reason, requestId, client) {
  const { rows: existingRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  await assertCan(user, 'assign', existing, { forShare: true }, client);

  // Verify target is an active member or lead in the team, locking target's membership FOR SHARE
  const { rows: targetRows } = await client.query(
    `SELECT role FROM team_memberships
     WHERE team_id = $1 AND user_id = $2 AND removed_at IS NULL FOR SHARE`,
    [existing.team_id, targetAssigneeId]
  );

  if (!targetRows.length || !['member', 'lead'].includes(targetRows[0].role)) {
    throw invalidAssignee();
  }

  if (['pending_approval', 'resolved', 'closed'].includes(existing.status)) {
    throw invalidTransition(`Cannot assign item in status "${existing.status}"`);
  }

  const { rows: updatedRows } = await client.query(
    `UPDATE work_items
     SET assignee_id = $1, status = 'in_progress', version = version + 1,
         event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
     WHERE id = $2 AND version = $3 AND status IN ('open', 'in_progress')
     RETURNING *`,
    [targetAssigneeId, itemId, expectedVersion]
  );

  if (updatedRows.length > 0) {
    const item = updatedRows[0];

    const { rows: eventRows } = await client.query(
      `INSERT INTO work_item_events (
        work_item_id, seq, item_version, actor_id, type, payload, request_id
      ) VALUES ($1, $2, $3, $4, 'assigned', $5, $6) RETURNING id`,
      [
        item.id, item.event_seq, item.version, user.id,
        JSON.stringify({ from: existing.assignee_id, to: targetAssigneeId, reason: reason || null }),
        requestId
      ]
    );

    await client.query(
      `INSERT INTO outbox (event_id, type, payload, status)
       VALUES ($1, 'work_item.assigned', $2, 'pending')`,
      [eventRows[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]
    );

    await client.query(
      `INSERT INTO work_item_assignees (work_item_id, user_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (work_item_id, user_id) DO NOTHING`,
      [item.id, targetAssigneeId, user.id]
    );

    await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
      actor_id: user.id,
      actor_name: user.name,
      changed_fields: ['assignee_id', 'status']
    });
    return { status: 200, body: item };
  }

  const { rows: currentRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  const current = currentRows[0];

  if (current.version !== Number(expectedVersion)) {
    throw versionConflict('Item was modified by another operation', current);
  }

  throw invalidTransition(`Cannot assign item in status "${current.status}"`);
}

/**
 * ADD CO-ASSIGNEE (Team lead or existing assignee can add co-workers to an item)
 */
export async function addWorkItemAssignee(user, itemId, targetUserIdOrIds, expectedVersion, client) {
  const { rows: existingRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  await assertCan(user, 'add_assignee', existing, { forShare: true }, client);

  const targetIds = Array.isArray(targetUserIdOrIds)
    ? targetUserIdOrIds.map(String)
    : [String(targetUserIdOrIds)];

  if (targetIds.length === 0) {
    throw validationError('At least one user must be specified');
  }

  // Validate all target users are active members of the team
  for (const tid of targetIds) {
    const { rows: targetRows } = await client.query(
      `SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [existing.team_id, tid]
    );
    if (!targetRows.length) throw invalidAssignee(`Target user ${tid} is not an active member of this team`);
  }

  // Insert all co-assignees
  for (const tid of targetIds) {
    await client.query(
      `INSERT INTO work_item_assignees (work_item_id, user_id, assigned_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (work_item_id, user_id) DO NOTHING`,
      [itemId, tid, user.id]
    );
  }

  // If item was open or unassigned, advance to in_progress with first target as primary
  const count = targetIds.length;
  let updateSql;
  let updateParams;
  if (existing.status === 'open' || !existing.assignee_id) {
    updateSql = `UPDATE work_items
      SET assignee_id = $1, status = 'in_progress', version = version + 1,
          event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
      WHERE id = $2 RETURNING *`;
    updateParams = [targetIds[0], itemId];
  } else {
    updateSql = `UPDATE work_items
      SET version = version + 1, event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
      WHERE id = $1 RETURNING *`;
    updateParams = [itemId];
  }

  const { rows: updatedRows } = await client.query(updateSql, updateParams);
  const item = updatedRows[0];

  // Fetch target user names for event
  const numericIds = targetIds.map(Number);
  const { rows: targetUserRows } = await client.query(
    `SELECT id, name FROM users WHERE id = ANY($1::bigint[])`,
    [numericIds]
  );
  const nameMap = Object.fromEntries(targetUserRows.map((u) => [String(u.id), u.name]));
  const targetNames = targetIds.map((tid) => nameMap[tid] || 'Collaborator');

  const { rows: eventRows } = await client.query(
    `INSERT INTO work_item_events (
      work_item_id, seq, item_version, actor_id, type, payload
    ) VALUES ($1, $2, $3, $4, 'assigned', $5) RETURNING id`,
    [
      item.id, item.event_seq, item.version, user.id,
      JSON.stringify({
        to: targetIds.length === 1 ? targetIds[0] : targetIds,
        target_name: targetNames.join(', '),
        action: 'co_assign'
      })
    ]
  );

  await client.query(
    `INSERT INTO outbox (event_id, type, payload, status)
     VALUES ($1, 'work_item.assigned', $2, 'pending')`,
    [eventRows[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]
  );

  await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
    actor_id: user.id,
    actor_name: user.name,
    changed_fields: ['assignees']
  });

  return { status: 200, body: item };
}

/**
 * REMOVE CO-ASSIGNEE
 */
export async function removeWorkItemAssignee(user, itemId, targetUserId, expectedVersion, client) {
  const { rows: existingRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  await assertCan(user, 'remove_assignee', existing, { forShare: true }, client);

  // If caller is not a lead, they can only remove themselves
  const role = await getTeamRole(user, existing.team_id, client);
  const isLead = role === 'lead' || user.is_org_admin;
  if (!isLead && String(user.id) !== String(targetUserId)) {
    throw forbidden('Only team leads can remove other assignees');
  }

  // Remove from work_item_assignees
  await client.query(
    `DELETE FROM work_item_assignees WHERE work_item_id = $1 AND user_id = $2`,
    [itemId, targetUserId]
  );

  // If this was primary assignee_id, select another remaining assignee or set null/open
  const { rows: remaining } = await client.query(
    `SELECT user_id FROM work_item_assignees WHERE work_item_id = $1 LIMIT 1`,
    [itemId]
  );

  let newAssigneeId = existing.assignee_id;
  let newStatus = existing.status;
  if (String(existing.assignee_id) === String(targetUserId)) {
    if (remaining.length > 0) {
      newAssigneeId = remaining[0].user_id;
    } else {
      newAssigneeId = null;
      newStatus = 'open';
    }
  }

  const { rows: updatedRows } = await client.query(
    `UPDATE work_items
     SET assignee_id = $1, status = $2, version = version + 1,
         event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
     WHERE id = $3 RETURNING *`,
    [newAssigneeId, newStatus, itemId]
  );
  const item = updatedRows[0];

  await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
    actor_id: user.id,
    actor_name: user.name,
    changed_fields: ['assignees']
  });

  return { status: 200, body: item };
}

/**
 * WORKFLOW TRANSITION (request_approval, approve, reject, resolve, close, reopen)
 */
export async function transitionWorkItem(user, itemId, action, expectedVersion, reason, requestId, client) {
  const { rows: existingRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  await assertCan(user, action, existing, { forShare: true }, client);

  // Transition allow-list per §2
  switch (action) {
    case 'request_approval': {
      if (existing.status !== 'in_progress') throw invalidTransition('request_approval requires status in_progress');

      // Check user is an assignee
      let isAssignee = String(existing.assignee_id) === String(user.id);
      if (!isAssignee) {
        const { rows: aRows } = await client.query(
          `SELECT 1 FROM work_item_assignees WHERE work_item_id = $1 AND user_id = $2`,
          [itemId, user.id]
        );
        isAssignee = aRows.length > 0;
      }
      if (!isAssignee) throw forbidden('Only an assignee can request approval');

      const { rows } = await client.query(
        `UPDATE work_items
         SET status = 'pending_approval', requires_approval = true, approval_requested_by = $1,
             fix_approved = false, fix_approved_by = NULL, fix_approved_at = NULL,
             version = version + 1, event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
         WHERE id = $2 AND version = $3 AND status = 'in_progress'
         RETURNING *`,
        [user.id, itemId, expectedVersion]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
        if (cur[0].version !== Number(expectedVersion)) throw versionConflict('Version conflict', cur[0]);
        throw invalidTransition('Cannot request approval');
      }

      const item = rows[0];
      const { rows: ev } = await client.query(
        `INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload, request_id)
         VALUES ($1, $2, $3, $4, 'approval_requested', $5, $6) RETURNING id`,
        [item.id, item.event_seq, item.version, user.id, JSON.stringify({ reason: reason || null }), requestId]
      );
      await client.query(
        `INSERT INTO outbox (event_id, type, payload, status)
         VALUES ($1, 'work_item.approval_requested', $2, 'pending')`,
        [ev[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id, actor_name: user.name })]
      );
      await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
        actor_id: user.id,
        actor_name: user.name,
        changed_fields: ['status']
      });
      return { status: 200, body: item };
    }

    case 'approve': {
      if (existing.status !== 'pending_approval') throw invalidTransition('approve requires status pending_approval');

      // Separation of duties enforced directly in SQL: approval_requested_by <> caller
      const { rows } = await client.query(
        `UPDATE work_items
         SET status = 'in_progress', approval_requested_by = NULL,
             fix_approved = true, fix_approved_by = $3, fix_approved_at = now(),
             version = version + 1, event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
         WHERE id = $1 AND version = $2 AND status = 'pending_approval' AND approval_requested_by <> $3
         RETURNING *`,
        [itemId, expectedVersion, user.id]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
        if (cur[0].version !== Number(expectedVersion)) throw versionConflict('Version conflict', cur[0]);
        if (String(cur[0].approval_requested_by) === String(user.id)) throw approverMustDiffer();
        throw invalidTransition('Cannot approve item');
      }

      const item = rows[0];
      const { rows: ev } = await client.query(
        `INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload, request_id)
         VALUES ($1, $2, $3, $4, 'approved', $5, $6) RETURNING id`,
        [item.id, item.event_seq, item.version, user.id, JSON.stringify({ reason: reason || null, approved_by_name: user.name }), requestId]
      );
      await client.query(
        `INSERT INTO outbox (event_id, type, payload, status)
         VALUES ($1, 'work_item.approved', $2, 'pending')`,
        [ev[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id, actor_name: user.name })]
      );
      await markDeadlineRemindersReadForItem(client, item.id);
      await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
        actor_id: user.id,
        actor_name: user.name,
        changed_fields: ['fix_approved', 'status']
      });
      return { status: 200, body: item };
    }

    case 'reject': {
      if (existing.status !== 'pending_approval') throw invalidTransition('reject requires status pending_approval');
      if (!reason || typeof reason !== 'string' || !reason.trim()) {
        throw validationError('Reason is required when rejecting approval');
      }

      const { rows } = await client.query(
        `UPDATE work_items
         SET status = 'in_progress', approval_requested_by = NULL, fix_approved = false,
             version = version + 1, event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
         WHERE id = $1 AND version = $2 AND status = 'pending_approval' AND approval_requested_by <> $3
         RETURNING *`,
        [itemId, expectedVersion, user.id]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
        if (cur[0].version !== Number(expectedVersion)) throw versionConflict('Version conflict', cur[0]);
        if (String(cur[0].approval_requested_by) === String(user.id)) throw approverMustDiffer();
        throw invalidTransition('Cannot reject item');
      }

      const item = rows[0];
      const { rows: ev } = await client.query(
        `INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload, request_id)
         VALUES ($1, $2, $3, $4, 'rejected', $5, $6) RETURNING id`,
        [item.id, item.event_seq, item.version, user.id, JSON.stringify({ reason }), requestId]
      );
      await client.query(
        `INSERT INTO outbox (event_id, type, payload, status)
         VALUES ($1, 'work_item.rejected', $2, 'pending')`,
        [ev[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id, actor_name: user.name })]
      );
      await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
        actor_id: user.id,
        actor_name: user.name,
        changed_fields: ['status']
      });
      return { status: 200, body: item };
    }

    case 'resolve': {
      if (existing.status !== 'in_progress') throw invalidTransition('resolve requires status in_progress');
      if (existing.requires_approval && !existing.fix_approved) {
        throw invalidTransition('Fix must be approved by a team lead before this item can be resolved');
      }

      const { rows } = await client.query(
        `UPDATE work_items
         SET status = 'resolved', resolved_at = now(), version = version + 1,
             event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
         WHERE id = $1 AND version = $2 AND status = 'in_progress'
         RETURNING *`,
        [itemId, expectedVersion]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
        if (cur[0].version !== Number(expectedVersion)) throw versionConflict('Version conflict', cur[0]);
        throw invalidTransition('Cannot resolve item');
      }

      const item = rows[0];
      const { rows: ev } = await client.query(
        `INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload, request_id)
         VALUES ($1, $2, $3, $4, 'resolved', $5, $6) RETURNING id`,
        [item.id, item.event_seq, item.version, user.id, JSON.stringify({ reason: reason || null }), requestId]
      );
      await client.query(
        `INSERT INTO outbox (event_id, type, payload, status)
         VALUES ($1, 'work_item.resolved', $2, 'pending')`,
        [ev[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id, actor_name: user.name })]
      );
      await markDeadlineRemindersReadForItem(client, item.id);
      await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq, {
        actor_id: user.id,
        actor_name: user.name,
        changed_fields: ['status']
      });
      return { status: 200, body: item };
    }

    case 'close': {
      if (existing.status !== 'resolved') throw invalidTransition('close requires status resolved');

      const { rows } = await client.query(
        `UPDATE work_items
         SET status = 'closed', version = version + 1,
             event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
         WHERE id = $1 AND version = $2 AND status = 'resolved'
         RETURNING *`,
        [itemId, expectedVersion]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
        if (cur[0].version !== Number(expectedVersion)) throw versionConflict('Version conflict', cur[0]);
        throw invalidTransition('Cannot close item');
      }

      const item = rows[0];
      const { rows: ev } = await client.query(
        `INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload, request_id)
         VALUES ($1, $2, $3, $4, 'closed', $5, $6) RETURNING id`,
        [item.id, item.event_seq, item.version, user.id, JSON.stringify({ reason: reason || null }), requestId]
      );
      await client.query(`INSERT INTO outbox (event_id, type, payload, status) VALUES ($1, 'work_item.closed', $2, 'pending')`, [ev[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]);
      await markDeadlineRemindersReadForItem(client, item.id);
      await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq);
      return { status: 200, body: item };
    }

    case 'reopen': {
      if (existing.status !== 'resolved') throw invalidTransition('reopen requires status resolved');

      const { rows } = await client.query(
        `UPDATE work_items
         SET status = 'open', assignee_id = NULL, resolved_at = NULL, version = version + 1,
             event_seq = event_seq + 1, updated_at = now(), last_activity_at = now()
         WHERE id = $1 AND version = $2 AND status = 'resolved'
         RETURNING *`,
        [itemId, expectedVersion]
      );

      if (!rows.length) {
        const { rows: cur } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
        if (cur[0].version !== Number(expectedVersion)) throw versionConflict('Version conflict', cur[0]);
        throw invalidTransition('Cannot reopen item');
      }

      const item = rows[0];
      const { rows: ev } = await client.query(
        `INSERT INTO work_item_events (work_item_id, seq, item_version, actor_id, type, payload, request_id)
         VALUES ($1, $2, $3, $4, 'reopened', $5, $6) RETURNING id`,
        [item.id, item.event_seq, item.version, user.id, JSON.stringify({ reason: reason || null, previous_assignee: existing.assignee_id }), requestId]
      );
      await client.query(`INSERT INTO outbox (event_id, type, payload, status) VALUES ($1, 'work_item.reopened', $2, 'pending')`, [ev[0].id, JSON.stringify({ work_item_id: item.id, team_id: item.team_id, actor_id: user.id })]);
      await notifyItemChanged(client, item.team_id, item.id, item.version, item.event_seq);
      return { status: 200, body: item };
    }

    default:
      throw invalidTransition(`Unknown action "${action}"`);
  }
}

/**
 * PATCH Work Item with Field-Level Merge (§4)
 */
export async function patchWorkItem(user, itemId, expectedVersion, fields, requestId, client) {
  // Validate allowed fields
  const ALLOWED_FIELDS = ['title', 'description', 'priority', 'due_at', 'kind'];
  const submittedKeys = Object.keys(fields);

  for (const k of submittedKeys) {
    if (!ALLOWED_FIELDS.includes(k)) {
      throw validationError(`Field "${k}" cannot be modified via PATCH`);
    }
  }

  if (submittedKeys.length === 0) {
    throw validationError('At least one field must be provided to update');
  }

  // 1. Lock the row FOR UPDATE (held for milliseconds)
  const { rows: lockedRows } = await client.query(
    `SELECT * FROM work_items WHERE id = $1 FOR UPDATE`,
    [itemId]
  );
  if (!lockedRows.length) throw notFound('Work item not found');
  const current = lockedRows[0];

  if (current.status === 'closed') {
    throw invalidTransition('Cannot edit a closed work item');
  }

  // 2. Authorization check on locked row
  const touchingPriority = 'priority' in fields;
  await assertCan(user, 'patch', current, { forShare: false, touchingPriority }, client);

  // 3. Check for No-Op (when version matches and no values actually differ)
  let hasActualChanges = false;
  const changes = {};

  for (const k of submittedKeys) {
    let newVal = fields[k];
    let curVal = current[k];

    if (k === 'due_at') {
      newVal = newVal ? new Date(newVal).toISOString() : null;
      curVal = curVal ? new Date(curVal).toISOString() : null;
    }

    if (curVal !== newVal) {
      hasActualChanges = true;
      changes[k] = { from: current[k], to: fields[k] };
    }
  }

  if (current.version === Number(expectedVersion)) {
    if (!hasActualChanges) {
      // No-op: return current item without version bump or event
      return { status: 200, body: current };
    }

    // Normal fast path: apply changes
    return await applyPatchUpdate(user, current, fields, changes, null, requestId, client);
  }

  // 4. Stale version: Field-Level Merge Logic (§4)
  const gap = current.version - Number(expectedVersion);
  if (gap <= 0 || gap > config.workflow.mergeMaxGap) {
    throw versionConflict('Version conflict exceeds mergeable window', current);
  }

  // Read intervening state-changing events in (expectedVersion, current.version]
  const { rows: eventRows } = await client.query(
    `SELECT item_version, payload FROM work_item_events
     WHERE work_item_id = $1 AND item_version > $2 AND item_version <= $3
     ORDER BY item_version ASC`,
    [itemId, expectedVersion, current.version]
  );

  // Fail closed if event count != gap (audit completeness check)
  if (eventRows.length !== gap) {
    throw versionConflict('Audit event gap detected, unable to safely auto-merge', current);
  }

  // Compute union of changed fields in intervening updates
  const interveningChangedFields = new Set();
  for (const ev of eventRows) {
    if (ev.payload?.changes) {
      for (const field of Object.keys(ev.payload.changes)) {
        interveningChangedFields.add(field);
      }
    }
  }

  // Determine conflicting fields
  const conflictingFields = submittedKeys.filter((k) => interveningChangedFields.has(k));

  if (conflictingFields.length > 0) {
    const { rows: lastEventRows } = await client.query(
      `SELECT u.name as actor_name
       FROM work_item_events e
       JOIN users u ON u.id = e.actor_id
       WHERE e.work_item_id = $1
       ORDER BY e.seq DESC LIMIT 1`,
      [current.id]
    );
    current.last_actor_name = lastEventRows[0]?.actor_name || 'Someone';
    throw versionConflict('Concurrent changes to the same fields', current, conflictingFields);
  }

  // Disjoint! Auto-merge is safe!
  return await applyPatchUpdate(user, current, fields, changes, expectedVersion, requestId, client);
}

async function applyPatchUpdate(user, current, fields, changes, mergedFromVersion, requestId, client) {
  const setClauses = [];
  const values = [];
  let paramIdx = 1;

  for (const [k, v] of Object.entries(fields)) {
    setClauses.push(`${k} = $${paramIdx++}`);
    values.push(k === 'due_at' && v ? new Date(v) : v);
  }

  setClauses.push(`version = version + 1`);
  setClauses.push(`event_seq = event_seq + 1`);
  setClauses.push(`updated_at = now()`);
  setClauses.push(`last_activity_at = now()`);

  values.push(current.id);
  const whereClause = `WHERE id = $${paramIdx}`;

  const sql = `UPDATE work_items SET ${setClauses.join(', ')} ${whereClause} RETURNING *`;
  const { rows: updatedRows } = await client.query(sql, values);
  const updated = updatedRows[0];

  const payload = {
    changes,
    merged_from_version: mergedFromVersion ? Number(mergedFromVersion) : undefined
  };

  const { rows: evRows } = await client.query(
    `INSERT INTO work_item_events (
      work_item_id, seq, item_version, actor_id, type, payload, request_id
    ) VALUES ($1, $2, $3, $4, 'updated', $5, $6) RETURNING id`,
    [updated.id, updated.event_seq, updated.version, user.id, JSON.stringify(payload), requestId]
  );

  await client.query(
    `INSERT INTO outbox (event_id, type, payload, status)
     VALUES ($1, 'work_item.updated', $2, 'pending')`,
    [evRows[0].id, JSON.stringify({ work_item_id: updated.id, team_id: updated.team_id, actor_id: user.id })]
  );

  if ('due_at' in fields) {
    await clearDeadlineRemindersForItem(client, updated.id);
  }

  await notifyItemChanged(client, updated.team_id, updated.id, updated.version, updated.event_seq, {
    actor_id: user.id,
    actor_name: user.name,
    changed_fields: Object.keys(fields),
    item: updated
  });

  const responseBody = {
    ...updated,
    merge: mergedFromVersion
      ? { merged: true, base_version: Number(mergedFromVersion), fields: Object.keys(fields) }
      : { merged: false }
  };

  return { status: 200, body: responseBody };
}

/**
 * ADD COMMENT (Bumps event_seq and last_activity_at, does NOT bump version!)
 */
export async function addComment(user, itemId, commentText, requestId, client) {
  if (!commentText || typeof commentText !== 'string' || !commentText.trim()) {
    throw validationError('Comment text cannot be empty');
  }
  if (commentText.length > 5000) {
    throw validationError('Comment text exceeds 5,000 character limit');
  }

  const { rows: existingRows } = await client.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!existingRows.length) throw notFound('Work item not found');
  const existing = existingRows[0];

  await assertCan(user, 'comment', existing, { forShare: true }, client);

  // Take item row lock to allocate contiguous seq, bump last_activity_at, leaves version untouched
  const { rows: lockRows } = await client.query(
    `UPDATE work_items
     SET event_seq = event_seq + 1, last_activity_at = now()
     WHERE id = $1
     RETURNING event_seq, version`,
    [itemId]
  );
  const { event_seq, version } = lockRows[0];

  // Insert event with item_version = NULL per DB CHECK constraint!
  const { rows: evRows } = await client.query(
    `INSERT INTO work_item_events (
      work_item_id, seq, item_version, actor_id, type, payload, request_id
    ) VALUES ($1, $2, NULL, $3, 'comment_added', $4, $5) RETURNING *`,
    [itemId, event_seq, user.id, JSON.stringify({ comment: commentText.trim() }), requestId]
  );
  const event = evRows[0];

  await client.query(
    `INSERT INTO outbox (event_id, type, payload, status)
     VALUES ($1, 'work_item.comment_added', $2, 'pending')`,
    [event.id, JSON.stringify({ work_item_id: itemId, team_id: existing.team_id, actor_id: user.id })]
  );

  await notifyItemChanged(client, existing.team_id, itemId, version, event_seq);

  return { status: 201, body: event };
}
