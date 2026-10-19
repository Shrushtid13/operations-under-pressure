// src/api/server.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';
import { pool } from '../db/pool.js';
import { AppError } from '../shared/errors.js';
import { csrfHook } from './hooks/csrfHook.js';
import { authHook } from './hooks/authHook.js';
import { startWorker } from '../worker/worker.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDistPath = path.resolve(__dirname, '../../web/dist');

import authRoutes from './routes/authRoutes.js';
import workItemRoutes from './routes/workItemRoutes.js';
import teamRoutes from './routes/teamRoutes.js';
import overviewRoutes from './routes/overviewRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import workspaceRoutes from './routes/workspaceRoutes.js';
import { registerWebSocketGateway } from './websocket.js';

export async function buildApp() {
  const app = Fastify({
    bodyLimit: 15 * 1024 * 1024, // 15 MB limit for document and PDF attachments
    genReqId: () => crypto.randomUUID(),
    trustProxy: true
  });

  // 0. CORS support
  await app.register(fastifyCors, {
    origin: (origin, cb) => {
      cb(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });

  // 1. Helmet security headers & CSP
  await app.register(fastifyHelmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", config.appOrigin, config.appOrigin.replace(/^http/, 'ws'), 'wss:', 'ws:'],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'self'"]
      }
    },
    xContentTypeOptions: true,
    referrerPolicy: { policy: 'no-referrer' },
    hsts: config.isProduction ? { maxAge: 31536000, includeSubDomains: true } : false
  });

  // 2. Cookie parser
  await app.register(fastifyCookie, {
    secret: config.cookieSecret
  });

  // 3. Rate limiting (in-memory, stricter on login)
  await app.register(fastifyRateLimit, {
    max: 1000,
    timeWindow: '1 minute'
  });

  // 4. WebSocket plugin
  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1024 // 1 KB inbound limit per §10.4
    }
  });

  // Handle empty or stringified JSON bodies gracefully
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body.trim() === '') {
      return done(null, {});
    }
    try {
      done(null, JSON.parse(body));
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // 5. Hooks: Logging, CSRF, and Authentication
  app.addHook('onRequest', async (req, reply) => {
    reply.header('x-request-id', req.id);
    reply.header('cache-control', 'private, no-cache');
  });

  app.addHook('preValidation', csrfHook);
  app.addHook('preHandler', authHook);

  // 6. Global Error Handler per §3
  app.setErrorHandler((error, request, reply) => {
    const requestId = request.id;

    if (error instanceof AppError) {
      logger.info({ requestId, code: error.code, message: error.message }, 'Application handled error');
      return reply.status(error.status).send({
        code: error.code,
        message: error.message,
        request_id: requestId,
        details: error.details
      });
    }

    // Fastify schema validation error (400)
    if (error.validation) {
      logger.info({ requestId, validation: error.validation }, 'Request validation failed');
      return reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: error.message,
        request_id: requestId,
        details: error.validation
      });
    }

    // Fastify payload too large (413)
    if (error.statusCode === 413) {
      return reply.status(413).send({
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Payload exceeds 64 KB limit',
        request_id: requestId
      });
    }

    // Rate limit error (429)
    if (error.statusCode === 429) {
      return reply.status(429).send({
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded',
        request_id: requestId
      });
    }

    // Catch-all 500 error: NEVER leak stack trace or internal SQL details
    logger.error({ requestId, err: error }, 'Unhandled internal server error');
    return reply.status(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An internal server error occurred',
      request_id: requestId
    });
  });

  // 7. Health & Readiness probes
  app.get('/healthz', async () => ({ status: 'ok', uptime: process.uptime() }));

  let wsStatus = 'healthy';
  app.get('/readyz', async (req, reply) => {
    try {
      await pool.query('SELECT 1');
      return { status: 'ready', database: 'connected', websocket: wsStatus };
    } catch (err) {
      logger.warn({ err }, 'Readiness check failed');
      return reply.status(503).send({ status: 'unready', database: 'disconnected', websocket: wsStatus });
    }
  });

  // 8. API Routes
  await app.register(authRoutes, { prefix: '/auth' });
  await app.register(workItemRoutes, { prefix: '/work-items' });
  await app.register(teamRoutes, { prefix: '/teams' });
  await app.register(overviewRoutes, { prefix: '/overview' });
  await app.register(notificationRoutes, { prefix: '/notifications' });
  await app.register(workspaceRoutes, { prefix: '/workspaces' });

  // 9. WebSocket Gateway registration
  const wsGateway = registerWebSocketGateway(app);
  app.wsGateway = wsGateway;

  // 10. Serve frontend static assets if built
  if (fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
      wildcard: false
    });

    app.setNotFoundHandler((req, reply) => {
      const url = req.raw.url || '';
      if (
        url.startsWith('/auth') ||
        url.startsWith('/work-items') ||
        url.startsWith('/teams') ||
        url.startsWith('/overview') ||
        url.startsWith('/notifications') ||
        url.startsWith('/workspaces') ||
        url.startsWith('/healthz') ||
        url.startsWith('/readyz') ||
        url.startsWith('/ws')
      ) {
        return reply.status(404).send({
          code: 'NOT_FOUND',
          message: 'API route not found',
          request_id: req.id
        });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  buildApp()
    .then(async (app) => {
      await app.listen({ port: config.port, host: config.host });
      logger.info(`API Server running at http://${config.host}:${config.port}`);

      // Start embedded Outbox & Deadline background worker if enabled
      if (process.env.DISABLE_EMBEDDED_WORKER !== 'true') {
        startWorker().catch((err) => {
          logger.error({ err }, 'Embedded background worker encountered an error');
        });
      }
    })
    .catch((err) => {
      logger.fatal({ err }, 'Failed to start API Server');
      process.exit(1);
    });
}

