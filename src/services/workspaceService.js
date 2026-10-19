// src/services/workspaceService.js
import crypto from 'node:crypto';
import { pool, withTransaction } from '../db/pool.js';
import { validationError, forbidden, notFound } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

/**
 * Get all workspaces a user belongs to
 */
export async function getUserWorkspaces(userId) {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.slug, w.created_at, wm.role,
            (SELECT COUNT(*) FROM teams t WHERE t.workspace_id = w.id)::int AS team_count,
            (SELECT COUNT(*) FROM workspace_memberships wm2 WHERE wm2.workspace_id = w.id)::int AS member_count
     FROM workspace_memberships wm
     JOIN workspaces w ON w.id = wm.workspace_id
     WHERE wm.user_id = $1
     ORDER BY w.created_at ASC`,
    [userId]
  );
  return rows;
}

/**
 * Create a new isolated workspace with an initial team
 */
export async function createWorkspace(userId, { name, initialTeamName, initialTeamKey }) {
  const wsName = (name || '').trim();
  if (!wsName || wsName.length < 2) {
    throw validationError('Workspace name must be at least 2 characters');
  }

  // Generate unique URL slug
  const baseSlug = wsName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'workspace';
  const randomSuffix = crypto.randomBytes(3).toString('hex');
  const slug = `${baseSlug}-${randomSuffix}`;

  const teamName = (initialTeamName || '').trim() || `${wsName} Operations`;

  // Generate safe 3-5 uppercase character team key
  let teamKey = (initialTeamKey || '').trim().toUpperCase();
  if (!teamKey || !/^[A-Z0-9]{2,6}$/.test(teamKey)) {
    const letters = wsName.replace(/[^A-Za-z]/g, '').toUpperCase();
    teamKey = (letters.slice(0, 3) || 'OPS') + crypto.randomBytes(1).toString('hex').toUpperCase().slice(0, 2);
  }

  return await withTransaction(async (client) => {
    // 1. Insert Workspace
    const { rows: wsRows } = await client.query(
      `INSERT INTO workspaces (name, slug, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, name, slug, created_at`,
      [wsName, slug, userId]
    );
    const workspace = wsRows[0];

    // 2. Add creator as Owner in workspace
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'owner')`,
      [workspace.id, userId]
    );

    // 3. Ensure team key uniqueness across database
    let safeKey = teamKey;
    const { rows: existingKey } = await client.query(`SELECT id FROM teams WHERE key = $1`, [safeKey]);
    if (existingKey.length > 0) {
      safeKey = `${teamKey.slice(0, 3)}${workspace.id}`;
    }

    // 4. Create primary team in workspace
    const { rows: teamRows } = await client.query(
      `INSERT INTO teams (name, key, workspace_id)
       VALUES ($1, $2, $3)
       RETURNING id, name, key, workspace_id`,
      [teamName, safeKey, workspace.id]
    );
    const team = teamRows[0];

    // 5. Add creator as Lead of the team
    await client.query(
      `INSERT INTO team_memberships (team_id, user_id, role)
       VALUES ($1, $2, 'lead')`,
      [team.id, userId]
    );

    logger.info({ userId, workspaceId: workspace.id, workspaceName: wsName }, 'New workspace created');

    return {
      workspace,
      team: {
        id: team.id,
        name: team.name,
        key: team.key,
        role: 'lead'
      }
    };
  });
}

/**
 * Generate an invitation code for a workspace/team (Lead/Owner only)
 */
export async function createInvitation(userId, workspaceId, { role = 'member', teamId = null, email = null }) {
  // Check if caller is workspace owner/admin or team lead
  const { rows: wsMemberRows } = await pool.query(
    `SELECT role FROM workspace_memberships WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId]
  );

  const isWsAdmin = wsMemberRows.length > 0 && ['owner', 'admin'].includes(wsMemberRows[0].role);

  let isTeamLead = false;
  if (teamId) {
    const { rows: teamMemberRows } = await pool.query(
      `SELECT role FROM team_memberships WHERE team_id = $1 AND user_id = $2 AND removed_at IS NULL`,
      [teamId, userId]
    );
    isTeamLead = teamMemberRows.length > 0 && teamMemberRows[0].role === 'lead';
  }

  if (!isWsAdmin && !isTeamLead) {
    throw forbidden('Only workspace owners, admins, or team leads can generate invitation codes');
  }

  const validRoles = ['lead', 'member', 'viewer'];
  const inviteRole = validRoles.includes(role) ? role : 'member';

  // Generate unique code: INV-XXXX-XXXX
  const codePart1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const codePart2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const code = `INV-${codePart1}-${codePart2}`;

  const { rows } = await pool.query(
    `INSERT INTO workspace_invitations (workspace_id, team_id, code, email, role, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, workspace_id, team_id, code, email, role, created_at, expires_at`,
    [workspaceId, teamId || null, code, email ? email.trim().toLowerCase() : null, inviteRole, userId]
  );

  const invitation = rows[0];

  const { rows: wsRows } = await pool.query(`SELECT name FROM workspaces WHERE id = $1`, [workspaceId]);
  const workspaceName = wsRows[0]?.name || 'Workspace';

  return {
    ...invitation,
    workspace_name: workspaceName
  };
}

/**
 * Validate an invitation code
 */
export async function getInvitationByCode(code) {
  const cleanCode = (code || '').trim().toUpperCase();
  if (!cleanCode) throw notFound('Invalid invitation code');

  const { rows } = await pool.query(
    `SELECT i.*, w.name AS workspace_name, t.name AS team_name, u.name AS inviter_name
     FROM workspace_invitations i
     JOIN workspaces w ON w.id = i.workspace_id
     LEFT JOIN teams t ON t.id = i.team_id
     LEFT JOIN users u ON u.id = i.created_by
     WHERE i.code = $1`,
    [cleanCode]
  );

  if (rows.length === 0) {
    throw notFound('Invitation code not found or invalid');
  }

  const inv = rows[0];
  if (inv.used_at && inv.code !== 'DEMO-NEWTONITE') {
    throw validationError('This invitation code has already been redeemed');
  }
  if (new Date(inv.expires_at) < new Date() && inv.code !== 'DEMO-NEWTONITE') {
    throw validationError('This invitation code has expired');
  }

  return inv;
}

/**
 * Accept an invitation code and join the workspace & team
 */
export async function acceptInvitation(userId, code) {
  const inv = await getInvitationByCode(code);

  return await withTransaction(async (client) => {
    // 1. Add to workspace
    await client.query(
      `INSERT INTO workspace_memberships (workspace_id, user_id, role)
       VALUES ($1, $2, 'member')
       ON CONFLICT (workspace_id, user_id) DO NOTHING`,
      [inv.workspace_id, userId]
    );

    // 2. Add to team(s)
    let joinedTeams = [];
    if (inv.team_id) {
      // Add to specific team
      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, removed_at = NULL`,
        [inv.team_id, userId, inv.role]
      );
      const { rows } = await client.query(`SELECT id, name, key, $1::text AS role FROM teams WHERE id = $2`, [inv.role, inv.team_id]);
      joinedTeams = rows;
    } else {
      // Add to all active teams in this workspace
      const { rows: wsTeams } = await client.query(`SELECT id, name, key FROM teams WHERE workspace_id = $1`, [inv.workspace_id]);
      for (const t of wsTeams) {
        await client.query(
          `INSERT INTO team_memberships (team_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (team_id, user_id) DO UPDATE SET role = EXCLUDED.role, removed_at = NULL`,
          [t.id, userId, inv.role]
        );
      }
      joinedTeams = wsTeams.map((t) => ({ ...t, role: inv.role }));
    }

    // 3. Mark invitation as used (unless reusable demo code)
    if (inv.code !== 'DEMO-NEWTONITE') {
      await client.query(
        `UPDATE workspace_invitations
         SET used_at = now(), used_by = $1
         WHERE id = $2`,
        [userId, inv.id]
      );
    }

    const { rows: wsRows } = await client.query(`SELECT id, name, slug FROM workspaces WHERE id = $1`, [inv.workspace_id]);

    logger.info({ userId, workspaceId: inv.workspace_id, code: inv.code }, 'User joined workspace via invitation');

    return {
      workspace: wsRows[0],
      teams: joinedTeams
    };
  });
}
