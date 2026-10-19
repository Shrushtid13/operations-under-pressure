// src/api/routes/workItemRoutes.js
import {
  executeCommand,
  createWorkItem,
  claimWorkItem,
  releaseWorkItem,
  assignWorkItem,
  addWorkItemAssignee,
  removeWorkItemAssignee,
  transitionWorkItem,
  patchWorkItem,
  addComment
} from '../../services/commands.js';
import { listWorkItems, getWorkItemDetail, listWorkItemEvents } from '../../services/queries.js';
import { validationError, notFound, forbidden } from '../../shared/errors.js';
import { pool } from '../../db/pool.js';
import { assertCan } from '../../services/policy.js';
import crypto from 'node:crypto';

export default async function workItemRoutes(fastify) {
  // GET /work-items - List
  fastify.get('/', async (req) => {
    return await listWorkItems(req.user, req.query);
  });

  // GET /work-items/:id - Detail
  fastify.get('/:id', async (req, reply) => {
    const item = await getWorkItemDetail(req.user, req.params.id);

    // ETag: "<version>-<event_seq>-<last_activity_time>-<att_count>-<hash of caller context>"
    const lastActivityTime = item.last_activity_at ? new Date(item.last_activity_at).getTime() : 0;
    const attCount = item.attachments ? item.attachments.length : 0;
    const callerHash = crypto.createHash('sha256')
      .update(`${req.user.id}:${item.is_overdue}`)
      .digest('hex')
      .slice(0, 8);
    const etag = `"${item.version}-${item.event_seq}-${lastActivityTime}-${attCount}-${callerHash}"`;

    reply.header('etag', etag);
    reply.header('vary', 'Cookie');

    // If-None-Match honored after authorization (already checked in getWorkItemDetail)
    const ifNoneMatch = req.headers['if-none-match'];
    if (ifNoneMatch === etag) {
      return reply.status(304).send();
    }

    return item;
  });

  // GET /work-items/:id/events - Timeline
  fastify.get('/:id/events', async (req) => {
    return await listWorkItemEvents(req.user, req.params.id, req.query);
  });

  // PATCH /work-items/:id - Edit fields
  fastify.patch('/:id', {
    schema: {
      body: {
        type: 'object',
        required: ['expected_version'],
        properties: {
          expected_version: { type: 'integer', minimum: 1 },
          title: { type: 'string', minLength: 1, maxLength: 200 },
          description: { type: ['string', 'null'], maxLength: 10000 },
          priority: { type: 'integer', minimum: 1, maximum: 4 },
          due_at: { type: ['string', 'null'], format: 'date-time' },
          kind: { type: 'string', enum: ['customer_issue', 'incident', 'payment', 'compliance', 'task'] }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { expected_version, ...fields } = req.body;

    // Reject if body contains protected fields (redundant with additionalProperties but defense in depth)
    for (const k of ['status', 'assignee_id', 'version', 'team_id', 'created_by', 'approval_requested_by', 'is_org_admin', 'role', 'requires_approval']) {
      if (k in req.body) throw validationError(`Field "${k}" cannot be modified via PATCH`);
    }

    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      (client) => patchWorkItem(req.user, req.params.id, expected_version, fields, req.id, client)
    );

    return reply.status(result.status).send(result.body);
  });

  // POST /work-items/:id/claim
  fastify.post('/:id/claim', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      (client) => claimWorkItem(req.user, req.params.id, req.id, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // POST /work-items/:id/release
  fastify.post('/:id/release', {
    schema: {
      body: {
        type: 'object',
        required: ['expected_version'],
        properties: {
          expected_version: { type: 'integer', minimum: 1 }
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
      (client) => releaseWorkItem(req.user, req.params.id, req.body.expected_version, req.id, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // POST /work-items/:id/assign
  fastify.post('/:id/assign', {
    schema: {
      body: {
        type: 'object',
        required: ['assignee_id', 'expected_version'],
        properties: {
          assignee_id: { type: 'string', pattern: '^[0-9]+$' },
          expected_version: { type: 'integer', minimum: 1 },
          reason: { type: 'string', maxLength: 1000 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { assignee_id, expected_version, reason } = req.body;

    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      (client) => assignWorkItem(req.user, req.params.id, assignee_id, expected_version, reason, req.id, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // POST /work-items/:id/assignees - Add co-assignee(s)
  fastify.post('/:id/assignees', {
    schema: {
      body: {
        type: 'object',
        properties: {
          user_id: { type: ['string', 'number'] },
          user_ids: { type: 'array', items: { type: ['string', 'number'] } },
          expected_version: { type: 'integer' }
        }
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { user_id, user_ids, expected_version } = req.body;
    const targetIds = user_ids && user_ids.length > 0
      ? user_ids.map(String)
      : (user_id !== undefined ? [String(user_id)] : []);
    if (!targetIds.length) {
      throw validationError('At least one user_id is required');
    }
    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      (client) => addWorkItemAssignee(req.user, req.params.id, targetIds, expected_version, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // DELETE /work-items/:id/assignees/:userId - Remove co-assignee
  fastify.delete('/:id/assignees/:userId', async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url },
      (client) => removeWorkItemAssignee(req.user, req.params.id, req.params.userId, req.query?.expected_version, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // POST /work-items/:id/transition
  fastify.post('/:id/transition', {
    schema: {
      body: {
        type: 'object',
        required: ['action', 'expected_version'],
        properties: {
          action: { type: 'string', enum: ['request_approval', 'approve', 'reject', 'resolve', 'close', 'reopen'] },
          expected_version: { type: 'integer', minimum: 1 },
          reason: { type: 'string', maxLength: 1000 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const idempotencyKey = req.headers['idempotency-key'];
    const { action, expected_version, reason } = req.body;

    const result = await executeCommand(
      req.user,
      idempotencyKey,
      { method: req.method, path: req.url, body: req.body },
      (client) => transitionWorkItem(req.user, req.params.id, action, expected_version, reason, req.id, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // POST /work-items/:id/comments
  fastify.post('/:id/comments', {
    schema: {
      body: {
        type: 'object',
        required: ['text'],
        properties: {
          text: { type: 'string', minLength: 1, maxLength: 5000 }
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
      (client) => addComment(req.user, req.params.id, req.body.text, req.id, client)
    );
    return reply.status(result.status).send(result.body);
  });

  // GET /work-items/:id/attachments
  fastify.get('/:id/attachments', async (req) => {
    const { rows: itemRows } = await pool.query(`SELECT * FROM work_items WHERE id = $1`, [req.params.id]);
    if (!itemRows.length) throw notFound('Work item not found');
    await assertCan(req.user, 'read', itemRows[0]);

    const { rows } = await pool.query(
      `SELECT a.*, u.name AS uploader_name, u.email AS uploader_email
       FROM work_item_attachments a
       JOIN users u ON u.id = a.uploader_id
       WHERE a.work_item_id = $1
       ORDER BY a.created_at ASC`,
      [req.params.id]
    );
    return { attachments: rows };
  });

  // POST /work-items/:id/attachments
  fastify.post('/:id/attachments', {
    schema: {
      body: {
        type: 'object',
        required: ['filename'],
        properties: {
          filename: { type: 'string', minLength: 1, maxLength: 255 },
          file_type: { type: 'string', maxLength: 100 },
          file_size: { type: 'integer', minimum: 0 },
          file_data: { type: 'string' },
          description: { type: ['string', 'null'], maxLength: 1000 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const { rows: itemRows } = await pool.query(`SELECT * FROM work_items WHERE id = $1`, [req.params.id]);
    if (!itemRows.length) throw notFound('Work item not found');
    await assertCan(req.user, 'comment', itemRows[0]);

    const { filename, file_type = 'application/pdf', file_size = 0, file_data = '', description } = req.body;

    // Sanitize file_data: strip any null bytes \0 that PostgreSQL rejects in text fields
    const safeFileData = typeof file_data === 'string'
      ? file_data.replace(/\0/g, '')
      : '';

    const { rows } = await pool.query(
      `INSERT INTO work_item_attachments (work_item_id, uploader_id, filename, file_type, file_size, file_data, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.params.id, req.user.id, filename, file_type, file_size, safeFileData, description || null]
    );

    const attachment = rows[0];

    // Update last activity and broadcast update to team
    await pool.query(
      `UPDATE work_items SET last_activity_at = now() WHERE id = $1`,
      [req.params.id]
    );

    await pool.query(
      `SELECT pg_notify('item_changes', $1)`,
      [JSON.stringify({
        team_id: itemRows[0].team_id,
        item_id: itemRows[0].id,
        version: itemRows[0].version,
        event_seq: itemRows[0].event_seq,
        is_attachment_change: true
      })]
    );

    return reply.status(201).send({
      attachment: {
        ...attachment,
        uploader_name: req.user.name,
        uploader_email: req.user.email
      }
    });
  });

  // DELETE /work-items/:id/attachments/:attachmentId
  fastify.delete('/:id/attachments/:attachmentId', async (req, reply) => {
    const { rows: itemRows } = await pool.query(`SELECT * FROM work_items WHERE id = $1`, [req.params.id]);
    if (!itemRows.length) throw notFound('Work item not found');
    await assertCan(req.user, 'comment', itemRows[0]);

    const { rows: attRows } = await pool.query(
      `SELECT * FROM work_item_attachments WHERE id = $1 AND work_item_id = $2`,
      [req.params.attachmentId, req.params.id]
    );
    if (!attRows.length) throw notFound('Attachment not found');

    const attachment = attRows[0];
    if (String(attachment.uploader_id) !== String(req.user.id) && !req.user.is_org_admin) {
      // Check if user is lead
      const role = await assertCan(req.user, 'read', itemRows[0]);
      if (role?.role !== 'lead') {
        throw forbidden('Only the uploader or team lead can delete attachments');
      }
    }

    await pool.query(`DELETE FROM work_item_attachments WHERE id = $1`, [req.params.attachmentId]);

    await pool.query(
      `UPDATE work_items SET last_activity_at = now() WHERE id = $1`,
      [req.params.id]
    );

    await pool.query(
      `SELECT pg_notify('item_changes', $1)`,
      [JSON.stringify({
        team_id: itemRows[0].team_id,
        item_id: itemRows[0].id,
        version: itemRows[0].version,
        event_seq: itemRows[0].event_seq,
        is_attachment_change: true
      })]
    );

    return reply.status(200).send({ success: true });
  });
}
