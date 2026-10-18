// src/api/routes/workItemRoutes.js
import {
  executeCommand,
  createWorkItem,
  claimWorkItem,
  releaseWorkItem,
  assignWorkItem,
  transitionWorkItem,
  patchWorkItem,
  addComment
} from '../../services/commands.js';
import { listWorkItems, getWorkItemDetail, listWorkItemEvents } from '../../services/queries.js';
import { validationError } from '../../shared/errors.js';
import crypto from 'node:crypto';

export default async function workItemRoutes(fastify) {
  // GET /work-items - List
  fastify.get('/', async (req) => {
    return await listWorkItems(req.user, req.query);
  });

  // GET /work-items/:id - Detail
  fastify.get('/:id', async (req, reply) => {
    const item = await getWorkItemDetail(req.user, req.params.id);

    // ETag: "<version>-<event_seq>-<hash of caller context>"
    const callerHash = crypto.createHash('sha256')
      .update(`${req.user.id}:${item.is_overdue}`)
      .digest('hex')
      .slice(0, 8);
    const etag = `"${item.version}-${item.event_seq}-${callerHash}"`;

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
}
