// src/services/policy.js
import { pool } from '../db/pool.js';
import { forbidden, notFound } from '../shared/errors.js';

export const ROLE_HIERARCHY = {
  viewer: 1,
  member: 2,
  lead: 3
};

/**
 * Retrieves the caller's active role for a specific team.
 * Returns null if the user has no active membership row.
 */
export async function getTeamRole(user, teamId, client = pool) {
  if (!user || !teamId) return null;

  const { rows } = await client.query(
    `SELECT role FROM team_memberships
     WHERE user_id = $1 AND team_id = $2 AND removed_at IS NULL`,
    [user.id, teamId]
  );

  return rows.length > 0 ? rows[0].role : null;
}

/**
 * Resource-level authorization policy check: can(user, action, workItem, options, client)
 * Throws 404 for invisible items (non-member) and 403 for insufficient privileges.
 */
export async function assertCan(user, action, workItem, options = {}, client = pool) {
  if (!user) throw notFound();

  const teamId = workItem ? workItem.team_id : options.teamId;
  if (!teamId) throw notFound();

  // If inside a transaction and lock is requested, lock the membership row FOR SHARE
  let roleQuery = `SELECT role FROM team_memberships WHERE user_id = $1 AND team_id = $2 AND removed_at IS NULL`;
  if (options.forShare) {
    roleQuery += ` FOR SHARE`;
  }

  const { rows } = await client.query(roleQuery, [user.id, teamId]);
  const userRole = rows.length > 0 ? rows[0].role : null;

  // Non-members: check if org admin within same workspace (read-only)
  if (!userRole) {
    if (user.is_org_admin) {
      const { rows: wsRows } = await client.query(
        `SELECT 1 FROM teams t
         JOIN workspace_memberships wm ON wm.workspace_id = t.workspace_id
         WHERE t.id = $1 AND wm.user_id = $2`,
        [teamId, user.id]
      );
      if (wsRows.length > 0) {
        // Org admin has read-only access to teams in their own workspace
        if (['read', 'view_events', 'view_summary', 'view_members', 'view_messages'].includes(action)) {
          return { role: 'viewer', isOrgAdmin: true };
        }
        // Org admin attempting write on non-member team gets 403
        throw forbidden('Org admin has read-only access to teams they are not a member of');
      }
    }
    // Regular non-member or foreign team gets 404 to avoid leaking existence
    throw notFound();
  }

  const roleLevel = ROLE_HIERARCHY[userRole] || 0;

  switch (action) {
    case 'read':
    case 'view_events':
    case 'view_members':
    case 'view_messages':
      // Any active member (viewer+) can read
      return { role: userRole };

    case 'create':
    case 'claim':
    case 'comment':
    case 'send_message':
      if (roleLevel < ROLE_HIERARCHY.member) {
        throw forbidden(`Action "${action}" requires member or lead role`);
      }
      return { role: userRole };

    case 'release':
      // Only the current assignee can release their own assignment
      if (String(workItem.assignee_id) !== String(user.id)) {
        throw forbidden('Only the current assignee can release this item');
      }
      return { role: userRole };

    case 'assign':
      if (roleLevel < ROLE_HIERARCHY.lead) {
        throw forbidden('Only team leads can assign work items');
      }
      return { role: userRole };

    case 'patch':
      if (roleLevel < ROLE_HIERARCHY.member) {
        throw forbidden('Viewers cannot edit work items');
      }
      // Priority check: changing priority requires lead role or being the current assignee
      if (options.touchingPriority) {
        let isAssignee = workItem.assignee_id && String(workItem.assignee_id) === String(user.id);
        if (!isAssignee && workItem.id) {
          const { rows: aRows } = await client.query(
            `SELECT 1 FROM work_item_assignees WHERE work_item_id = $1 AND user_id = $2`,
            [workItem.id, user.id]
          );
          isAssignee = aRows.length > 0;
        }
        const isLead = roleLevel >= ROLE_HIERARCHY.lead;
        if (!isLead && !isAssignee) {
          throw forbidden('Changing priority requires team lead role or being the current assignee');
        }
      }
      return { role: userRole };

    case 'request_approval': {
      // Current assignee initiates approval
      let isAssignee = workItem.assignee_id && String(workItem.assignee_id) === String(user.id);
      if (!isAssignee && workItem.id) {
        const { rows: aRows } = await client.query(
          `SELECT 1 FROM work_item_assignees WHERE work_item_id = $1 AND user_id = $2`,
          [workItem.id, user.id]
        );
        isAssignee = aRows.length > 0;
      }
      if (!isAssignee) {
        throw forbidden('Only an assignee working on this item can request approval');
      }
      return { role: userRole };
    }

    case 'resolve': {
      if (roleLevel < ROLE_HIERARCHY.member) {
        throw forbidden('Viewers cannot resolve work items');
      }
      let isAssignee = workItem.assignee_id && String(workItem.assignee_id) === String(user.id);
      if (!isAssignee && workItem.id) {
        const { rows: aRows } = await client.query(
          `SELECT 1 FROM work_item_assignees WHERE work_item_id = $1 AND user_id = $2`,
          [workItem.id, user.id]
        );
        isAssignee = aRows.length > 0;
      }
      if (!isAssignee) {
        throw forbidden('The resolved mark can only be done by the current assignee');
      }
      return { role: userRole };
    }

    case 'add_assignee':
    case 'remove_assignee':
      if (roleLevel < ROLE_HIERARCHY.member) {
        throw forbidden('Viewers cannot manage assignees');
      }
      return { role: userRole };

    case 'approve':
    case 'reject':
    case 'close':
    case 'reopen':
      if (roleLevel < ROLE_HIERARCHY.lead) {
        throw forbidden(`Action "${action}" requires team lead role`);
      }
      return { role: userRole };

    case 'manage_members':
      if (roleLevel < ROLE_HIERARCHY.lead) {
        throw forbidden('Only team leads can manage team memberships');
      }
      return { role: userRole };

    default:
      throw forbidden(`Unauthorized action "${action}"`);
  }
}
