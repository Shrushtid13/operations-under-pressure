// src/api/routes/authRoutes.js
import { login, logout, changePassword, register } from '../../services/authService.js';
import { pool } from '../../db/pool.js';
import { config } from '../../shared/config.js';
import { validationError } from '../../shared/errors.js';

export default async function authRoutes(fastify) {
  // POST /auth/login
  fastify.post('/login', {
    config: {
      rateLimit: {
        max: config.isProduction ? 20 : 1000,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 1 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const { email, password } = req.body;
    const existingToken = req.cookies?.session_token;

    const { token, user } = await login(email, password, existingToken);

    reply.setCookie('session_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 12 * 60 * 60 // 12 hours
    });

    return { user, token };
  });

  // POST /auth/register
  fastify.post('/register', {
    config: {
      rateLimit: {
        max: config.isProduction ? 15 : 1000,
        timeWindow: '1 minute'
      }
    },
    schema: {
      body: {
        type: 'object',
        required: ['email', 'name', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string', minLength: 1, maxLength: 100 },
          password: { type: 'string', minLength: 8, maxLength: 128 },
          role: { type: 'string', enum: ['lead', 'member', 'viewer'] },
          workspace_name: { type: 'string', maxLength: 80 },
          invite_code: { type: 'string', maxLength: 30 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const { email, name, password, role, workspace_name, invite_code } = req.body;
    const { token, user } = await register(email, name, password, { role, workspace_name, invite_code });

    reply.setCookie('session_token', token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 12 * 60 * 60 // 12 hours
    });

    return { user, token };
  });

  // POST /auth/logout
  fastify.post('/logout', async (req, reply) => {
    let token = req.sessionToken || req.cookies?.session_token;
    if (!token && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }
    if (token) {
      try {
        await logout(token);
      } catch {
        // If already revoked or expired, proceed to clear cookie
      }
    }
    reply.clearCookie('session_token', { path: '/' });
    return { success: true };
  });

  // GET /me
  fastify.get('/me', async (req) => {
    const user = req.user;

    // Load active team memberships with workspace info
    const { rows: memberships } = await pool.query(
      `SELECT t.id, t.name, t.key, tm.role, t.workspace_id, w.name AS workspace_name
       FROM team_memberships tm
       JOIN teams t ON t.id = tm.team_id
       LEFT JOIN workspaces w ON w.id = t.workspace_id
       WHERE tm.user_id = $1 AND tm.removed_at IS NULL
       ORDER BY t.name`,
      [user.id]
    );

    // Load user's workspaces
    const { rows: workspaces } = await pool.query(
      `SELECT w.id, w.name, w.slug, wm.role
       FROM workspace_memberships wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY wm.created_at ASC`,
      [user.id]
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_org_admin: user.is_org_admin,
        teams: memberships,
        workspaces
      }
    };
  });

  // POST /auth/password
  fastify.post('/password', {
    schema: {
      body: {
        type: 'object',
        required: ['current_password', 'new_password'],
        properties: {
          current_password: { type: 'string' },
          new_password: { type: 'string', minLength: 12, maxLength: 128 }
        },
        additionalProperties: false
      }
    }
  }, async (req, reply) => {
    const { current_password, new_password } = req.body;
    const token = req.sessionToken || req.cookies?.session_token;

    const { token: newToken } = await changePassword(req.user, current_password, new_password, token);

    reply.setCookie('session_token', newToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 12 * 60 * 60
    });

    return { success: true };
  });
}
