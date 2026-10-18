// src/api/websocket.js
import pg from 'pg';
import { validateSession } from '../services/authService.js';
import { config } from '../shared/config.js';
import { logger } from '../shared/logger.js';

const { Client } = pg;

/**
 * WebSocket Gateway: authenticated hints only, one LISTEN connection per replica
 */
export function registerWebSocketGateway(app) {
  // In-memory state
  const userSockets = new Map();   // userId -> Set<ws>
  const socketMeta = new Map();    // ws -> { userId, teamIds, sessionTokenHash, lastRevalidated }
  let totalConnections = 0;
  let listenerClient = null;
  let listenerHealthy = false;
  let heartbeatInterval = null;
  let revalidateInterval = null;

  // Register the WebSocket route
  app.get('/ws', { websocket: true }, async (socket, req) => {
    // 1. Authenticate at handshake
    const token = req.cookies?.session_token;
    if (!token) {
      socket.close(4401, 'Unauthenticated');
      return;
    }

    // Origin check
    const origin = req.headers.origin;
    if (origin) {
      try {
        const normalizedAppOrigin = new URL(config.appOrigin).origin;
        const normalizedRequestOrigin = new URL(origin).origin;
        if (normalizedAppOrigin !== normalizedRequestOrigin) {
          socket.close(4403, 'Origin mismatch');
          return;
        }
      } catch {
        socket.close(4403, 'Invalid origin');
        return;
      }
    }

    let user;
    try {
      user = await validateSession(token);
    } catch {
      socket.close(4401, 'Session validation failed');
      return;
    }

    if (!user) {
      socket.close(4401, 'Invalid or expired session');
      return;
    }

    // Check per-user limit
    const existing = userSockets.get(String(user.id)) || new Set();
    if (existing.size >= config.ws.maxConnectionsPerUser) {
      socket.close(4429, 'Connection limit per user exceeded');
      return;
    }

    // Check total limit
    if (totalConnections >= config.ws.maxConnectionsTotal) {
      socket.close(1013, 'Server at capacity');
      return;
    }

    // Check listener health
    if (!listenerHealthy) {
      socket.close(1013, 'WebSocket gateway not ready');
      return;
    }

    // 2. Load team memberships
    let teamIds;
    try {
      const { Pool } = pg;
      const tempPool = app.pg || (await import('../db/pool.js')).pool;
      const { rows } = await tempPool.query(
        user.is_org_admin
          ? `SELECT id AS team_id FROM teams`
          : `SELECT team_id FROM team_memberships WHERE user_id = $1 AND removed_at IS NULL`,
        user.is_org_admin ? [] : [user.id]
      );
      teamIds = new Set(rows.map((r) => String(r.team_id)));
    } catch (err) {
      logger.error({ err }, 'Failed to load team memberships for WebSocket');
      socket.close(1013, 'Internal error');
      return;
    }

    // 3. Register connection
    const userId = String(user.id);
    existing.add(socket);
    userSockets.set(userId, existing);
    socketMeta.set(socket, {
      userId,
      teamIds,
      sessionTokenHash: user.sessionTokenHash,
      lastRevalidated: Date.now()
    });
    totalConnections++;

    logger.debug({ userId, totalConnections }, 'WebSocket connected');

    // 4. Ignore inbound application messages
    socket.on('message', () => {
      // Inbound messages are intentionally ignored per architecture
    });

    socket.on('close', () => {
      const meta = socketMeta.get(socket);
      if (meta) {
        const sockets = userSockets.get(meta.userId);
        if (sockets) {
          sockets.delete(socket);
          if (sockets.size === 0) userSockets.delete(meta.userId);
        }
        socketMeta.delete(socket);
      }
      totalConnections--;
    });

    socket.on('error', (err) => {
      logger.warn({ err, userId }, 'WebSocket error');
    });
  });

  // --- LISTEN connection to PostgreSQL ---

  async function connectListener() {
    try {
      listenerClient = new Client({ connectionString: config.db.runtimeUrl });
      await listenerClient.connect();

      listenerClient.on('notification', (msg) => {
        try {
          const payload = JSON.parse(msg.payload);

          if (msg.channel === 'item_changes') {
            broadcastToTeam(payload.team_id, {
              type: 'item',
              team_id: payload.team_id,
              item_id: payload.item_id,
              version: payload.version,
              event_seq: payload.event_seq
            });
          } else if (msg.channel === 'user_notifications') {
            // payload is just a user_id string
            sendToUser(payload, { type: 'notification' });
          } else if (msg.channel === 'membership_changes') {
            // Close affected user's sockets with 4403 to trigger reconnect
            const affectedUserId = String(payload.user_id);
            const sockets = userSockets.get(affectedUserId);
            if (sockets) {
              for (const ws of sockets) {
                ws.close(4403, 'Membership changed');
              }
            }

            // Broadcast membership hint to the team
            broadcastToTeam(payload.team_id, { type: 'membership', team_id: payload.team_id });
          }
        } catch (err) {
          logger.error({ err, channel: msg.channel }, 'Error processing pg_notify');
        }
      });

      listenerClient.on('error', (err) => {
        logger.error({ err }, 'LISTEN connection error');
        listenerHealthy = false;
        reconnectListener();
      });

      listenerClient.on('end', () => {
        logger.warn('LISTEN connection ended');
        listenerHealthy = false;
        reconnectListener();
      });

      await listenerClient.query('LISTEN item_changes');
      await listenerClient.query('LISTEN user_notifications');
      await listenerClient.query('LISTEN membership_changes');
      listenerHealthy = true;
      logger.info('WebSocket LISTEN connection established');
    } catch (err) {
      logger.error({ err }, 'Failed to establish LISTEN connection');
      listenerHealthy = false;
      reconnectListener();
    }
  }

  let reconnectTimeout = null;
  let reconnectDelay = 1000;

  function reconnectListener() {
    if (reconnectTimeout) return;
    reconnectTimeout = setTimeout(async () => {
      reconnectTimeout = null;
      try {
        if (listenerClient) {
          listenerClient.removeAllListeners();
          await listenerClient.end().catch(() => {});
        }
      } catch {}
      reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      await connectListener();
      if (listenerHealthy) reconnectDelay = 1000; // reset on success
    }, reconnectDelay);
  }

  function broadcastToTeam(teamId, message) {
    const data = JSON.stringify(message);
    const teamIdStr = String(teamId);

    for (const [ws, meta] of socketMeta.entries()) {
      if (meta.teamIds.has(teamIdStr) && ws.readyState === 1) {
        try {
          ws.send(data);
        } catch (err) {
          logger.warn({ err, userId: meta.userId }, 'Failed to send WebSocket message');
        }
      }
    }
  }

  function sendToUser(userId, message) {
    const sockets = userSockets.get(String(userId));
    if (!sockets) return;
    const data = JSON.stringify(message);
    for (const ws of sockets) {
      if (ws.readyState === 1) {
        try { ws.send(data); } catch {}
      }
    }
  }

  // Heartbeat: ping every 25s, close dead sockets
  heartbeatInterval = setInterval(() => {
    for (const [ws, meta] of socketMeta.entries()) {
      if (ws.readyState === 1) {
        ws.ping();
      }
    }
  }, config.ws.heartbeatIntervalMs);

  // Session re-validation every 30s
  revalidateInterval = setInterval(async () => {
    const now = Date.now();
    for (const [ws, meta] of socketMeta.entries()) {
      if (now - meta.lastRevalidated < config.ws.sessionRevalidateMs) continue;

      try {
        const { Pool } = pg;
        const checkPool = (await import('../db/pool.js')).pool;
        const { rows } = await checkPool.query(
          `SELECT s.revoked_at, s.expires_at, s.last_seen_at
           FROM sessions s WHERE s.id_hash = $1`,
          [meta.sessionTokenHash]
        );

        if (!rows.length || rows[0].revoked_at || new Date(rows[0].expires_at) <= new Date()) {
          ws.close(4401, 'Session expired or revoked');
          continue;
        }

        // Check idle timeout (2 hours)
        const lastSeen = new Date(rows[0].last_seen_at);
        if (now - lastSeen.getTime() > 2 * 60 * 60 * 1000) {
          ws.close(4401, 'Session idle timeout');
          continue;
        }

        meta.lastRevalidated = now;
      } catch (err) {
        logger.warn({ err, userId: meta.userId }, 'Session revalidation failed');
      }
    }
  }, config.ws.sessionRevalidateMs);

  // Start listener
  connectListener();

  return {
    getStatus() {
      return {
        healthy: listenerHealthy,
        totalConnections,
        uniqueUsers: userSockets.size
      };
    },

    async shutdown() {
      clearInterval(heartbeatInterval);
      clearInterval(revalidateInterval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);

      // Close all sockets
      for (const [ws] of socketMeta.entries()) {
        ws.close(1001, 'Server shutting down');
      }

      if (listenerClient) {
        listenerClient.removeAllListeners();
        await listenerClient.end().catch(() => {});
      }
    }
  };
}
