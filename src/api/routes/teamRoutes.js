// src/api/routes/teamRoutes.js
import { listTeamMembers } from '../../services/queries.js';
import { executeCommand, createWorkItem } from '../../services/commands.js';
import { withTransaction, pool } from '../../db/pool.js';
import { assertCan, getTeamRole } from '../../services/policy.js';
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

  // GET /teams/:id/messages - List team chat messages
  fastify.get('/:id/messages', async (req) => {
    const teamId = req.params.id;
    await assertCan(req.user, 'view_messages', null, { teamId });

    const limit = Math.min(Math.max(parseInt(req.query.limit || 50, 10), 1), 100);

    const { rows } = await pool.query(
      `SELECT m.id, m.team_id, m.sender_id, u.name AS sender_name, u.email AS sender_email,
              tm.role AS sender_role, m.content, m.created_at
       FROM team_messages m
       JOIN users u ON u.id = m.sender_id
       LEFT JOIN team_memberships tm ON tm.team_id = m.team_id AND tm.user_id = m.sender_id AND tm.removed_at IS NULL
       WHERE m.team_id = $1
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT $2`,
      [teamId, limit]
    );

    return { messages: rows };
  });

  // POST /teams/:id/messages - Post team chat message
  fastify.post('/:id/messages', {
    schema: {
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', minLength: 1, maxLength: 4000 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const teamId = req.params.id;
    const content = req.body.content?.trim();

    if (!content) {
      throw validationError('Message content cannot be blank');
    }

    await assertCan(req.user, 'send_message', null, { teamId });

    const { rows } = await pool.query(
      `INSERT INTO team_messages (team_id, sender_id, content)
       VALUES ($1, $2, $3)
       RETURNING id, team_id, sender_id, content, created_at`,
      [teamId, req.user.id, content]
    );

    const newMsg = rows[0];

    // Broadcast instant WebSocket notification via LISTEN/NOTIFY
    await pool.query(
      `SELECT pg_notify('team_chat', $1)`,
      [JSON.stringify({ team_id: teamId, message_id: newMsg.id })]
    );

    // Create notifications for other active team members
    const { rows: memberRows } = await pool.query(
      `SELECT user_id FROM team_memberships
       WHERE team_id = $1 AND user_id != $2 AND removed_at IS NULL`,
      [teamId, req.user.id]
    );

    for (const m of memberRows) {
      await pool.query(
        `INSERT INTO notifications (user_id, team_id, message_id, kind)
         VALUES ($1, $2, $3, 'chat_message')
         ON CONFLICT DO NOTHING`,
        [m.user_id, teamId, newMsg.id]
      );
      await pool.query(`SELECT pg_notify('user_notifications', $1)`, [String(m.user_id)]);
    }

    const role = await getTeamRole(req.user, teamId);

    return reply.status(201).send({
      message: {
        ...newMsg,
        sender_name: req.user.name,
        sender_email: req.user.email,
        sender_role: role
      }
    });
  });

  // GET /teams/:id/on-call - Get on-call roster and operational calls
  fastify.get('/:id/on-call', async (req) => {
    const teamId = req.params.id;
    await assertCan(req.user, 'read', null, { teamId });

    // 1. Fetch active shifts
    const { rows: shifts } = await pool.query(
      `SELECT s.*, u.name AS user_name, u.email AS user_email, tm.role AS team_role
       FROM on_call_shifts s
       JOIN users u ON u.id = s.user_id
       LEFT JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.user_id = s.user_id AND tm.removed_at IS NULL
       WHERE s.team_id = $1 AND s.ends_at >= now() - interval '1 day'
       ORDER BY
         CASE s.tier WHEN 'primary' THEN 1 WHEN 'secondary' THEN 2 ELSE 3 END,
         s.starts_at ASC`,
      [teamId]
    );

    // If no shifts are in the DB yet, create default shifts from team members
    let activeShifts = shifts;
    if (activeShifts.length === 0) {
      const { rows: members } = await pool.query(
        `SELECT u.id, u.name, u.email, tm.role
         FROM team_memberships tm
         JOIN users u ON u.id = tm.user_id
         WHERE tm.team_id = $1 AND tm.removed_at IS NULL
         ORDER BY CASE tm.role WHEN 'lead' THEN 1 WHEN 'member' THEN 2 ELSE 3 END`,
        [teamId]
      );

      if (members.length > 0) {
        const primary = members[0];
        const secondary = members[1] || members[0];
        const escalation = members.find((m) => m.role === 'lead') || members[0];

        await pool.query(
          `INSERT INTO on_call_shifts (team_id, user_id, tier, starts_at, ends_at)
           VALUES
             ($1, $2, 'primary', now() - interval '2 days', now() + interval '5 days'),
             ($1, $3, 'secondary', now() - interval '2 days', now() + interval '5 days'),
             ($1, $4, 'escalation', now() - interval '2 days', now() + interval '5 days')`,
          [teamId, primary.id, secondary.id, escalation.id]
        );

        const { rows: newlyCreated } = await pool.query(
          `SELECT s.*, u.name AS user_name, u.email AS user_email, tm.role AS team_role
           FROM on_call_shifts s
           JOIN users u ON u.id = s.user_id
           LEFT JOIN team_memberships tm ON tm.team_id = s.team_id AND tm.user_id = s.user_id
           WHERE s.team_id = $1
           ORDER BY CASE s.tier WHEN 'primary' THEN 1 WHEN 'secondary' THEN 2 ELSE 3 END`,
          [teamId]
        );
        activeShifts = newlyCreated;
      }
    }

    // 2. Fetch active and recent operational calls
    const { rows: calls } = await pool.query(
      `SELECT c.*, u.name AS creator_name, u.email AS creator_email,
              w.title AS work_item_title, w.number AS work_item_number, t.key AS team_key
       FROM operational_calls c
       JOIN users u ON u.id = c.creator_id
       JOIN teams t ON t.id = c.team_id
       LEFT JOIN work_items w ON w.id = c.work_item_id
       WHERE c.team_id = $1
       ORDER BY c.scheduled_at DESC, c.id DESC
       LIMIT 30`,
      [teamId]
    );

    return {
      shifts: activeShifts,
      calls
    };
  });

  // POST /teams/:id/calls - Schedule a call (Google Meet / Microsoft Teams)
  fastify.post('/:id/calls', {
    schema: {
      body: {
        type: 'object',
        required: ['title'],
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: ['string', 'null'], maxLength: 2000 },
          platform: { type: 'string', enum: ['google_meet', 'teams', 'zoom'] },
          meeting_url: { type: ['string', 'null'] },
          scheduled_at: { type: ['string', 'null'] },
          work_item_id: { type: ['integer', 'string', 'null'] },
          participants: { type: 'array', items: { type: ['integer', 'string'] } }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const teamId = req.params.id;
    await assertCan(req.user, 'comment', null, { teamId });

    const {
      title,
      description,
      platform = 'google_meet',
      work_item_id,
      participants = []
    } = req.body;

    // Generate valid meeting link if none provided
    let meetingUrl = req.body.meeting_url?.trim();
    if (!meetingUrl) {
      if (platform === 'teams') {
        const confId = Math.floor(100000000 + Math.random() * 900000000);
        meetingUrl = `https://teams.microsoft.com/l/meetup-join/operations-${confId}`;
      } else {
        // Google Meet format: meet.google.com/xxx-yyyy-zzz
        const part1 = Math.random().toString(36).substring(2, 5);
        const part2 = Math.random().toString(36).substring(2, 6);
        const part3 = Math.random().toString(36).substring(2, 5);
        meetingUrl = `https://meet.google.com/${part1}-${part2}-${part3}`;
      }
    }

    const scheduledTime = req.body.scheduled_at ? new Date(req.body.scheduled_at) : new Date();

    const { rows } = await pool.query(
      `INSERT INTO operational_calls (
         team_id, creator_id, title, description, platform, meeting_url,
         scheduled_at, work_item_id, participants, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'active')
       RETURNING *`,
      [
        teamId,
        req.user.id,
        title.trim(),
        description?.trim() || null,
        platform,
        meetingUrl,
        scheduledTime,
        work_item_id ? parseInt(work_item_id, 10) : null,
        JSON.stringify(participants)
      ]
    );

    const newCall = rows[0];

    // Notify all participants (and team members if no specific participants selected)
    let recipientIds = participants;
    if (!recipientIds || recipientIds.length === 0) {
      const { rows: allMembers } = await pool.query(
        `SELECT user_id FROM team_memberships WHERE team_id = $1 AND removed_at IS NULL AND user_id != $2`,
        [teamId, req.user.id]
      );
      recipientIds = allMembers.map((m) => m.user_id);
    }

    for (const pId of recipientIds) {
      if (String(pId) === String(req.user.id)) continue;
      await pool.query(
        `INSERT INTO notifications (user_id, team_id, call_id, kind)
         VALUES ($1, $2, $3, 'call_invite')
         ON CONFLICT DO NOTHING`,
        [pId, teamId, newCall.id]
      );
      await pool.query(`SELECT pg_notify('user_notifications', $1)`, [String(pId)]);
    }

    // Broadcast instant call alert via LISTEN/NOTIFY
    await pool.query(
      `SELECT pg_notify('team_calls', $1)`,
      [JSON.stringify({
        team_id: teamId,
        call_id: newCall.id,
        title: newCall.title,
        meeting_url: newCall.meeting_url,
        platform: newCall.platform,
        creator_name: req.user.name
      })]
    );

    return reply.status(201).send({
      call: {
        ...newCall,
        creator_name: req.user.name,
        creator_email: req.user.email
      }
    });
  });

  // PATCH /teams/:id/calls/:callId - Update call status
  fastify.patch('/:id/calls/:callId', async (req, reply) => {
    const teamId = req.params.id;
    await assertCan(req.user, 'comment', null, { teamId });

    const status = req.body?.status || 'completed';
    const { rows } = await pool.query(
      `UPDATE operational_calls
       SET status = $1
       WHERE id = $2 AND team_id = $3
       RETURNING *`,
      [status, req.params.callId, teamId]
    );

    if (!rows.length) throw notFound('Call not found');
    return { call: rows[0] };
  });
}
