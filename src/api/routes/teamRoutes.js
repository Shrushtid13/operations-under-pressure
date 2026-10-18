// src/api/routes/teamRoutes.js
import { listTeamMembers } from '../../services/queries.js';
import { executeCommand, createWorkItem } from '../../services/commands.js';
import { withTransaction, pool } from '../../db/pool.js';
import { assertCan } from '../../services/policy.js';
import {
  notFound, forbidden, validationError, invalidAssignee,
  lastLead, memberHasActiveItems
} from '../../shared/errors.js';

export default async function teamRoutes(fastify) {
  // POST /teams/:id/work-items - Create work item
  fastify.post('/:id/work-items', {
    schema: {
      body: {
        type: 'object',
        required: ['title', 'kind', 'priority'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: ['string', 'null'], maxLength: 10000 },
          kind: { type: 'string', enum: ['customer_issue', 'incident', 'payment', 'compliance', 'task'] },
          priority: { type: 'integer', minimum: 1, maximum: 4 },
          due_at: { type: ['string', 'null'], format: 'date-time' },
          requires_approval: { type: 'boolean' }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      (client) => createWorkItem(req.user, req.params.id, req.body, req.id, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // GET /teams/:id/members
  fastify.get('/:id/members', async (req) => {
    return await listTeamMembers(req.user, req.params.id);
  });

  // POST /teams/:id/members - Add or reactivate
  fastify.post('/:id/members', {
    schema: {
      body: {
        type: 'object',
        required: ['email', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          role: { type: 'string', enum: ['viewer', 'member', 'lead'] }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const teamId = req.params.id;
    const { email, role } = req.body;

    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      async (client) => {
        // Lock team row (rank 1)
        const { rows: teamRows } = await client.query(
          `SELECT id FROM teams WHERE id = $1 FOR UPDATE`, [teamId]
        );
        if (!teamRows.length) throw notFound('Team not found');

        // Check caller is lead (no share lock on caller's row per locking protocol)
        await assertCan(req.user, 'manage_members', null, { teamId }, client);

        // Look up user by email
        const { rows: userRows } = await client.query(
          `SELECT id, name FROM users WHERE email = $1`, [email.trim().toLowerCase()]
        );
        if (!userRows.length) throw notFound('User with this email not found');
        const targetUser = userRows[0];

        // Check existing membership
        const { rows: memberRows } = await client.query(
          `SELECT team_id, user_id, role, removed_at FROM team_memberships
           WHERE team_id = $1 AND user_id = $2 FOR NO KEY UPDATE`,
          [teamId, targetUser.id]
        );

        if (memberRows.length > 0) {
          const existing = memberRows[0];
          if (!existing.removed_at) {
            // Already active member
            return { status: 200, body: { id: targetUser.id, name: targetUser.name, role: existing.role } };
          }

          // Reactivate removed member
          await client.query(
            `UPDATE team_memberships SET role = $1, removed_at = NULL WHERE team_id = $2 AND user_id = $3`,
            [role, teamId, targetUser.id]
          );

          await client.query(
            `INSERT INTO membership_events (team_id, user_id, actor_id, action, from_role, to_role, request_id)
             VALUES ($1, $2, $3, 'reactivated', NULL, $4, $5)`,
            [teamId, targetUser.id, req.user.id, role, req.id]
          );

          return { status: 200, body: { id: targetUser.id, name: targetUser.name, role } };
        }

        // New membership
        await client.query(
          `INSERT INTO team_memberships (team_id, user_id, role) VALUES ($1, $2, $3)`,
          [teamId, targetUser.id, role]
        );

        await client.query(
          `INSERT INTO membership_events (team_id, user_id, actor_id, action, to_role, request_id)
           VALUES ($1, $2, $3, 'added', $4, $5)`,
          [teamId, targetUser.id, req.user.id, role, req.id]
        );

        return { status: 201, body: { id: targetUser.id, name: targetUser.name, role } };
      }
    );

    return reply.status(result.status).send(result.body);
  });

  // PATCH /teams/:id/members/:userId - Change role
  fastify.patch('/:id/members/:userId', {
    schema: {
      body: {
        type: 'object',
        required: ['role'],
        properties: {
          role: { type: 'string', enum: ['viewer', 'member', 'lead'] }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const teamId = req.params.id;
    const targetUserId = req.params.userId;
    const { role: newRole } = req.body;

    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      async (client) => {
        // Lock team row (rank 1)
        await client.query(`SELECT id FROM teams WHERE id = $1 FOR UPDATE`, [teamId]);
        await assertCan(req.user, 'manage_members', null, { teamId }, client);

        // Lock target membership (rank 2, FOR NO KEY UPDATE)
        const { rows: memberRows } = await client.query(
          `SELECT role, removed_at FROM team_memberships
           WHERE team_id = $1 AND user_id = $2 FOR NO KEY UPDATE`,
          [teamId, targetUserId]
        );
        if (!memberRows.length || memberRows[0].removed_at) throw notFound('Member not found in this team');

        const currentRole = memberRows[0].role;
        if (currentRole === newRole) {
          return { status: 200, body: { id: targetUserId, role: newRole } };
        }

        // Last lead guard
        if (currentRole === 'lead' && newRole !== 'lead') {
          const { rows: leadCount } = await client.query(
            `SELECT COUNT(*) AS cnt FROM team_memberships
             WHERE team_id = $1 AND role = 'lead' AND removed_at IS NULL AND user_id <> $2`,
            [teamId, targetUserId]
          );
          if (parseInt(leadCount[0].cnt, 10) === 0) throw lastLead();
        }

        // Active items guard for demotion to viewer
        if (newRole === 'viewer' && ['member', 'lead'].includes(currentRole)) {
          const { rows: activeItems } = await client.query(
            `SELECT w.id, w.number, t.key AS team_key FROM work_items w
             JOIN teams t ON t.id = w.team_id
             WHERE w.assignee_id = $1 AND w.team_id = $2
               AND w.status IN ('in_progress', 'pending_approval')
             LIMIT 20`,
            [targetUserId, teamId]
          );
          if (activeItems.length > 0) {
            throw memberHasActiveItems(
              'Cannot demote member with active work items',
              activeItems.map((i) => `${i.team_key}-${i.number}`)
            );
          }
        }

        await client.query(
          `UPDATE team_memberships SET role = $1 WHERE team_id = $2 AND user_id = $3`,
          [newRole, teamId, targetUserId]
        );

        await client.query(
          `INSERT INTO membership_events (team_id, user_id, actor_id, action, from_role, to_role, request_id)
           VALUES ($1, $2, $3, 'role_changed', $4, $5, $6)`,
          [teamId, targetUserId, req.user.id, currentRole, newRole, req.id]
        );

        // Notify membership change via pg_notify for WebSocket close
        await client.query(
          `SELECT pg_notify('membership_changes', $1)`,
          [JSON.stringify({ team_id: teamId, user_id: targetUserId, action: 'role_changed' })]
        );

        return { status: 200, body: { id: targetUserId, role: newRole } };
      }
    );

    return reply.status(result.status).send(result.body);
  });

  // DELETE /teams/:id/members/:userId - Soft remove
  fastify.delete('/:id/members/:userId', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const teamId = req.params.id;
    const targetUserId = req.params.userId;

    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: {} },
      async (client) => {
        await client.query(`SELECT id FROM teams WHERE id = $1 FOR UPDATE`, [teamId]);
        await assertCan(req.user, 'manage_members', null, { teamId }, client);

        const { rows: memberRows } = await client.query(
          `SELECT role, removed_at FROM team_memberships
           WHERE team_id = $1 AND user_id = $2 FOR NO KEY UPDATE`,
          [teamId, targetUserId]
        );
        if (!memberRows.length || memberRows[0].removed_at) throw notFound('Member not found in this team');

        const currentRole = memberRows[0].role;

        // Last lead guard
        if (currentRole === 'lead') {
          const { rows: leadCount } = await client.query(
            `SELECT COUNT(*) AS cnt FROM team_memberships
             WHERE team_id = $1 AND role = 'lead' AND removed_at IS NULL AND user_id <> $2`,
            [teamId, targetUserId]
          );
          if (parseInt(leadCount[0].cnt, 10) === 0) throw lastLead();
        }

        // Active items guard
        const { rows: activeItems } = await client.query(
          `SELECT w.id, w.number, t.key AS team_key FROM work_items w
           JOIN teams t ON t.id = w.team_id
           WHERE w.assignee_id = $1 AND w.team_id = $2
             AND w.status IN ('in_progress', 'pending_approval')
           LIMIT 20`,
          [targetUserId, teamId]
        );
        if (activeItems.length > 0) {
          throw memberHasActiveItems(
            'Cannot remove member with active work items',
            activeItems.map((i) => `${i.team_key}-${i.number}`)
          );
        }

        await client.query(
          `UPDATE team_memberships SET removed_at = now() WHERE team_id = $1 AND user_id = $2`,
          [teamId, targetUserId]
        );

        await client.query(
          `INSERT INTO membership_events (team_id, user_id, actor_id, action, from_role, request_id)
           VALUES ($1, $2, $3, 'removed', $4, $5)`,
          [teamId, targetUserId, req.user.id, currentRole, req.id]
        );

        await client.query(
          `SELECT pg_notify('membership_changes', $1)`,
          [JSON.stringify({ team_id: teamId, user_id: targetUserId, action: 'removed' })]
        );

        return { status: 200, body: { success: true } };
      }
    );

    return reply.status(result.status).send(result.body);
  });
}
