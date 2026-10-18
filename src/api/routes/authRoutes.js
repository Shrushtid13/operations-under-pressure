// src/api/routes/authRoutes.js
import { login, logout, changePassword } from '../../services/authService.js';
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

  // POST /auth/logout
  fastify.post('/logout', async (req, reply) => {
    const token = req.sessionToken || req.cookies?.session_token;
    if (token) {
      await logout(token);
    }
    reply.clearCookie('session_token', { path: '/' });
    return { success: true };
  });

  // GET /me
  fastify.get('/me', async (req) => {
    const user = req.user;

    // Load active team memberships
    const { rows: memberships } = await pool.query(
      `SELECT t.id, t.name, t.key, tm.role
       FROM team_memberships tm
       JOIN teams t ON t.id = tm.team_id
       WHERE tm.user_id = $1 AND tm.removed_at IS NULL
       ORDER BY t.name`,
      [user.id]
    );

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_org_admin: user.is_org_admin,
        teams: memberships
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
