// src/services/queries.js
import { pool } from '../db/pool.js';
import { assertCan } from './policy.js';
import { notFound, validationError } from '../shared/errors.js';

/**
 * Build membership scope subquery for list authorization
 */
function membershipScope(user) {
  if (user.is_org_admin) {
    return { clause: '', params: [], nextIdx: 1 };
  }
  return {
    clause: `AND w.team_id IN (SELECT team_id FROM team_memberships WHERE user_id = $1 AND removed_at IS NULL)`,
    params: [user.id],
    nextIdx: 2
  };
}

/**
 * GET /work-items - List with filters, keyset pagination, search
 */
export async function listWorkItems(user, query) {
  const {
    team, status, assignee, priority, overdue, needs_attention,
    q, sort = 'priority', cursor, limit = 50
  } = query;

  const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  // Determine status filter
  let statusFilter;
  if (status) {
    const validStatuses = ['open', 'in_progress', 'pending_approval', 'resolved', 'closed'];
    const requested = Array.isArray(status) ? status : status.split(',');
    for (const s of requested) {
      if (!validStatuses.includes(s)) throw validationError(`Invalid status "${s}"`);
    }
    statusFilter = requested;
  }

  // Validate sort + status combination
  const hasHistorical = statusFilter && (statusFilter.includes('resolved') || statusFilter.includes('closed'));
  if (sort === 'priority' && hasHistorical) {
    throw validationError('sort=priority is not available when including resolved/closed statuses');
  }

  const scope = membershipScope(user);
  const params = [...scope.params];
  let idx = scope.nextIdx;
  const conditions = ['1=1', scope.clause].filter(Boolean);

  // Team filter
  if (team) {
    conditions.push(`w.team_id = $${idx++}`);
    params.push(team);
  }

  // Status filter
  if (statusFilter) {
    conditions.push(`w.status = ANY($${idx++})`);
    params.push(statusFilter);
  } else {
    // Default to active statuses
    conditions.push(`w.status IN ('open', 'in_progress', 'pending_approval')`);
  }

  // Assignee filter
  if (assignee === 'me') {
    conditions.push(`w.assignee_id = $${idx++}`);
    params.push(user.id);
  } else if (assignee === 'none') {
    conditions.push(`w.assignee_id IS NULL`);
  } else if (assignee) {
    conditions.push(`w.assignee_id = $${idx++}`);
    params.push(assignee);
  }

  // Priority filter
  if (priority) {
    conditions.push(`w.priority = $${idx++}`);
    params.push(parseInt(priority, 10));
  }

  // Overdue filter
  if (overdue === 'true') {
    conditions.push(`w.due_at IS NOT NULL AND w.due_at < now()`);
  }

  // needs_attention filter (§3: assigned-to-me not resolved/closed, or pending my approval, or unassigned priority >= 3, or overdue, or stale)
  if (needs_attention === 'true') {
    conditions.push(`(
      (w.assignee_id = $${idx} AND w.status IN ('in_progress', 'pending_approval'))
      OR (w.status = 'pending_approval' AND w.assignee_id IS NOT NULL AND w.approval_requested_by <> $${idx}
          AND EXISTS (SELECT 1 FROM team_memberships tm WHERE tm.team_id = w.team_id AND tm.user_id = $${idx} AND tm.role = 'lead' AND tm.removed_at IS NULL))
      OR (w.assignee_id IS NULL AND w.priority >= 3 AND w.status = 'open')
      OR (w.due_at IS NOT NULL AND w.due_at < now() AND w.status IN ('open', 'in_progress', 'pending_approval'))
      OR (w.last_activity_at < now() - interval '3 days' AND w.status IN ('open', 'in_progress', 'pending_approval'))
    )`);
    params.push(user.id);
    idx++;
  }

  // Full-text search
  if (q) {
    // Check if it's an item key lookup (e.g., OPS-123)
    const keyMatch = q.match(/^([A-Z]+)-(\d+)$/);
    if (keyMatch) {
      conditions.push(`w.team_id = (SELECT id FROM teams WHERE key = $${idx++}) AND w.number = $${idx++}`);
      params.push(keyMatch[1], parseInt(keyMatch[2], 10));
    } else {
      conditions.push(`w.search_vector @@ websearch_to_tsquery('english', $${idx++})`);
      params.push(q);
    }
  }

  // Sort and cursor
  let orderBy;
  let cursorCondition = '';

  if (sort === 'priority') {
    orderBy = 'w.priority DESC, w.updated_at DESC, w.id DESC';
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) throw validationError('Invalid cursor');
      cursorCondition = `AND (w.priority, w.updated_at, w.id) < ($${idx++}, $${idx++}, $${idx++})`;
      params.push(decoded.priority, new Date(decoded.updated_at), decoded.id);
    }
  } else {
    orderBy = 'w.updated_at DESC, w.id DESC';
    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (!decoded) throw validationError('Invalid cursor');
      cursorCondition = `AND (w.updated_at, w.id) < ($${idx++}, $${idx++})`;
      params.push(new Date(decoded.updated_at), decoded.id);
    }
  }

  const sql = `
    SELECT w.*, t.key AS team_key, t.name AS team_name,
           u_assignee.name AS assignee_name,
           u_creator.name AS created_by_name
    FROM work_items w
    JOIN teams t ON t.id = w.team_id
    LEFT JOIN users u_assignee ON u_assignee.id = w.assignee_id
    LEFT JOIN users u_creator ON u_creator.id = w.created_by
    WHERE ${conditions.join(' ')} ${cursorCondition}
    ORDER BY ${orderBy}
    LIMIT $${idx++}
  `;
  params.push(pageLimit + 1); // fetch one extra to detect next page

  const { rows } = await pool.query(sql, params);

  const hasMore = rows.length > pageLimit;
  const items = hasMore ? rows.slice(0, pageLimit) : rows;

  let nextCursor = null;
  if (hasMore) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor({
      id: last.id,
      priority: last.priority,
      updated_at: last.updated_at
    });
  }

  return { items, next_cursor: nextCursor, has_more: hasMore };
}

function encodeCursor(obj) {
  return Buffer.from(JSON.stringify(obj)).toString('base64url');
}

function decodeCursor(str) {
  try {
    return JSON.parse(Buffer.from(str, 'base64url').toString('utf-8'));
  } catch {
    return null;
  }
}

/**
 * GET /work-items/:id - Detail with ETag
 */
export async function getWorkItemDetail(user, itemId) {
  const { rows } = await pool.query(
    `SELECT w.*, t.key AS team_key, t.name AS team_name,
            u_assignee.name AS assignee_name, u_assignee.email AS assignee_email,
            u_creator.name AS created_by_name,
            u_requester.name AS requested_by_name,
            u_approval.name AS approval_requested_by_name
     FROM work_items w
     JOIN teams t ON t.id = w.team_id
     LEFT JOIN users u_assignee ON u_assignee.id = w.assignee_id
     LEFT JOIN users u_creator ON u_creator.id = w.created_by
     LEFT JOIN users u_requester ON u_requester.id = w.requested_by
     LEFT JOIN users u_approval ON u_approval.id = w.approval_requested_by
     WHERE w.id = $1`,
    [itemId]
  );

  if (!rows.length) throw notFound();
  const item = rows[0];

  // Authorization check (returns 404 for non-member, 403 for insufficient role)
  await assertCan(user, 'read', item);

  // Derive next_action hint
  const nextAction = deriveNextAction(user, item);

  // Compute is_overdue
  const isOverdue = item.due_at && new Date(item.due_at) < new Date() &&
    ['open', 'in_progress', 'pending_approval'].includes(item.status);

  return {
    ...item,
    item_key: `${item.team_key}-${item.number}`,
    next_action: nextAction,
    is_overdue: isOverdue
  };
}

function deriveNextAction(user, item) {
  switch (item.status) {
    case 'open':
      return 'Unassigned — needs an owner';
    case 'in_progress':
      if (item.requires_approval) return 'In progress — will need approval before resolving';
      return 'In progress';
    case 'pending_approval':
      if (String(item.approval_requested_by) === String(user.id)) return 'You requested approval — awaiting lead review';
      return 'Awaiting approval from a lead';
    case 'resolved':
      return 'Resolved — can be closed or reopened';
    case 'closed':
      return 'Closed (terminal)';
    default:
      return null;
  }
}

/**
 * GET /work-items/:id/events - Timeline pagination
 */
export async function listWorkItemEvents(user, itemId, query) {
  // Verify item access
  const { rows: itemRows } = await pool.query(`SELECT * FROM work_items WHERE id = $1`, [itemId]);
  if (!itemRows.length) throw notFound();
  await assertCan(user, 'view_events', itemRows[0]);

  const { before_seq, after_seq, limit = 50 } = query;
  const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  let sql;
  let params;

  if (after_seq) {
    // Incremental poll: oldest first
    sql = `
      SELECT e.*, u.name AS actor_name
      FROM work_item_events e
      JOIN users u ON u.id = e.actor_id
      WHERE e.work_item_id = $1 AND e.seq > $2
      ORDER BY e.seq ASC
      LIMIT $3
    `;
    params = [itemId, parseInt(after_seq, 10), pageLimit];
  } else if (before_seq) {
    // History (newest first, paging backward)
    sql = `
      SELECT e.*, u.name AS actor_name
      FROM work_item_events e
      JOIN users u ON u.id = e.actor_id
      WHERE e.work_item_id = $1 AND e.seq < $2
      ORDER BY e.seq DESC
      LIMIT $3
    `;
    params = [itemId, parseInt(before_seq, 10), pageLimit];
  } else {
    // Default: newest first
    sql = `
      SELECT e.*, u.name AS actor_name
      FROM work_item_events e
      JOIN users u ON u.id = e.actor_id
      WHERE e.work_item_id = $1
      ORDER BY e.seq DESC
      LIMIT $2
    `;
    params = [itemId, pageLimit];
  }

  const { rows } = await pool.query(sql, params);
  return { events: rows };
}

/**
 * GET /overview/summary - Attention counts per team
 */
export async function getOverviewSummary(user) {
  let teamFilter;
  let params;

  if (user.is_org_admin) {
    teamFilter = '1=1';
    params = [];
  } else {
    teamFilter = `t.id IN (SELECT team_id FROM team_memberships WHERE user_id = $1 AND removed_at IS NULL)`;
    params = [user.id];
  }

  const sql = `
    SELECT
      t.id AS team_id, t.name AS team_name, t.key AS team_key,
      COUNT(*) FILTER (WHERE w.status = 'open') AS open_count,
      COUNT(*) FILTER (WHERE w.status = 'in_progress') AS in_progress_count,
      COUNT(*) FILTER (WHERE w.status = 'pending_approval') AS pending_approval_count,
      COUNT(*) FILTER (WHERE w.assignee_id IS NULL AND w.status = 'open') AS unassigned_count,
      COUNT(*) FILTER (WHERE w.due_at IS NOT NULL AND w.due_at < now()
        AND w.status IN ('open', 'in_progress', 'pending_approval')) AS overdue_count,
      COUNT(*) FILTER (WHERE w.last_activity_at < now() - interval '3 days'
        AND w.status IN ('open', 'in_progress', 'pending_approval')) AS stale_count
    FROM teams t
    LEFT JOIN work_items w ON w.team_id = t.id AND w.status IN ('open', 'in_progress', 'pending_approval')
    WHERE ${teamFilter}
    GROUP BY t.id, t.name, t.key
    ORDER BY t.name
  `;

  const { rows } = await pool.query(sql, params);
  return { teams: rows };
}

/**
 * GET /teams/:id/members - Active members
 */
export async function listTeamMembers(user, teamId) {
  await assertCan(user, 'view_members', null, { teamId });

  const { rows } = await pool.query(
    `SELECT u.id, u.name, tm.role
     FROM team_memberships tm
     JOIN users u ON u.id = tm.user_id
     WHERE tm.team_id = $1 AND tm.removed_at IS NULL
     ORDER BY
       CASE tm.role WHEN 'lead' THEN 1 WHEN 'member' THEN 2 WHEN 'viewer' THEN 3 END,
       u.name`,
    [teamId]
  );

  return { members: rows };
}

/**
 * GET /notifications - Inbox (keyset paginated, newest first)
 */
export async function listNotifications(user, query) {
  const { cursor, limit = 50 } = query;
  const pageLimit = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 100);

  let cursorCondition = '';
  const params = [user.id];
  let idx = 2;

  if (cursor) {
    const decoded = decodeCursor(cursor);
    if (!decoded) throw validationError('Invalid cursor');
    cursorCondition = `AND (n.created_at, n.id) < ($${idx++}, $${idx++})`;
    params.push(new Date(decoded.created_at), decoded.id);
  }

  // Join on current membership (or org admin) so lost team access hides notifications
  const membershipJoin = user.is_org_admin
    ? ''
    : `JOIN team_memberships tm ON tm.team_id = w.team_id AND tm.user_id = $1 AND tm.removed_at IS NULL`;

  const sql = `
    SELECT n.*, w.title AS item_title, t.key AS team_key, w.number AS item_number,
           u_actor.name AS actor_name, e.type AS event_type
    FROM notifications n
    JOIN work_item_events e ON e.id = n.event_id
    JOIN work_items w ON w.id = n.work_item_id
    JOIN teams t ON t.id = w.team_id
    ${membershipJoin}
    LEFT JOIN users u_actor ON u_actor.id = e.actor_id
    WHERE n.user_id = $1 ${cursorCondition}
    ORDER BY n.created_at DESC, n.id DESC
    LIMIT $${idx++}
  `;
  params.push(pageLimit + 1);

  const { rows } = await pool.query(sql, params);

  const hasMore = rows.length > pageLimit;
  const items = hasMore ? rows.slice(0, pageLimit) : rows;

  let nextCursor = null;
  if (hasMore) {
    const last = items[items.length - 1];
    nextCursor = encodeCursor({ created_at: last.created_at, id: last.id });
  }

  // Unread count
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*) AS unread_count FROM notifications WHERE user_id = $1 AND read_at IS NULL`,
    [user.id]
  );

  return {
    notifications: items,
    next_cursor: nextCursor,
    has_more: hasMore,
    unread_count: parseInt(countRows[0].unread_count, 10)
  };
}

/**
 * POST /notifications/:id/read
 */
export async function markNotificationRead(user, notificationId) {
  const { rowCount } = await pool.query(
    `UPDATE notifications SET read_at = now() WHERE id = $1 AND user_id = $2 AND read_at IS NULL`,
    [notificationId, user.id]
  );
  if (rowCount === 0) {
    // Check if it exists but belongs to another user or is already read
    const { rows } = await pool.query(`SELECT id, read_at FROM notifications WHERE id = $1 AND user_id = $2`, [notificationId, user.id]);
    if (!rows.length) throw notFound();
    // Already read — idempotent
    return { success: true };
  }
  return { success: true };
}
