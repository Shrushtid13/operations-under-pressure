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

  // Non-members: check if org admin (read-only)
  if (!userRole) {
    if (user.is_org_admin) {
      // Org admin has read-only access to all teams
      if (['read', 'view_events', 'view_summary', 'view_members'].includes(action)) {
        return { role: 'viewer', isOrgAdmin: true };
      }
      // Org admin attempting write on foreign team gets 403 (they know it exists)
      throw forbidden('Org admin has read-only access to teams they are not a member of');
    }
    // Regular non-member gets 404 to avoid leaking existence
    throw notFound();
  }

  const roleLevel = ROLE_HIERARCHY[userRole] || 0;

  switch (action) {
    case 'read':
    case 'view_events':
    case 'view_members':
      // Any active member (viewer+) can read
      return { role: userRole };

    case 'create':
    case 'claim':
    case 'comment':
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
        const isAssignee = workItem.assignee_id && String(workItem.assignee_id) === String(user.id);
        const isLead = roleLevel >= ROLE_HIERARCHY.lead;
        if (!isLead && !isAssignee) {
          throw forbidden('Changing priority requires team lead role or being the current assignee');
        }
      }
      return { role: userRole };

    case 'request_approval':
      // Current assignee initiates approval
      if (String(workItem.assignee_id) !== String(user.id)) {
        throw forbidden('Only the current assignee can request approval');
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
