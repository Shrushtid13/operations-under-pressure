// src/services/authService.js
import crypto from 'node:crypto';
import argon2 from 'argon2';
import { pool, withTransaction } from '../db/pool.js';
import { OWASP_ARGON2_OPTIONS, hashPassword } from '../db/seed.js';
import { invalidCredentials, unauthenticated, validationError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';
import { config } from '../shared/config.js';

// Precomputed dummy hash for timing attack mitigation on non-existent accounts
let DUMMY_HASH;
(async () => {
  DUMMY_HASH = await hashPassword('__dummy_password_timing_defense__');
})();

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function generateSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

const ABSOLUTE_SESSION_MS = 12 * 60 * 60 * 1000; // 12 hours
const IDLE_SESSION_MS = 2 * 60 * 60 * 1000; // 2 hours
const IDLE_TOUCH_INTERVAL_MS = 5 * 60 * 1000; // update last_seen_at at most every 5 min

export async function login(email, password, existingToken = null) {
  const normalizedEmail = (email || '').trim().toLowerCase();

  // Load user
  const { rows } = await pool.query(
    `SELECT id, email, name, password_hash, is_org_admin, failed_logins, last_failed_login_at, locked_until
     FROM users WHERE email = $1`,
    [normalizedEmail]
  );

  const user = rows[0];

  // If user does not exist, run dummy verification to maintain constant-time behavior
  if (!user) {
    await argon2.verify(DUMMY_HASH || (await hashPassword('dummy')), password || '');
    throw invalidCredentials();
  }

  const now = new Date();

  // Check lockout
  if (user.locked_until && new Date(user.locked_until) > now) {
    logger.warn({ userId: user.id }, 'Login attempt on locked account');
    throw invalidCredentials();
  }

  // Verify password with Argon2id
  const valid = await argon2.verify(user.password_hash, password || '');

  if (!valid) {
    // Atomic update of failed attempts and potential 15-minute lockout
    await pool.query(
      `UPDATE users
       SET 
         failed_logins = CASE 
           WHEN last_failed_login_at IS NULL OR last_failed_login_at < now() - interval '15 minutes' THEN 1
           ELSE failed_logins + 1
         END,
         last_failed_login_at = now(),
         locked_until = CASE 
           WHEN (CASE WHEN last_failed_login_at IS NULL OR last_failed_login_at < now() - interval '15 minutes' THEN 1 ELSE failed_logins + 1 END) >= 5 
           THEN now() + interval '15 minutes'
           ELSE locked_until
         END
       WHERE id = $1`,
      [user.id]
    );

    logger.warn({ userId: user.id }, 'Failed login attempt');
    throw invalidCredentials();
  }

  // Successful login: reset failed_logins counter, revoke any old token presented, insert new session
  return await withTransaction(async (client) => {
    await client.query(
      `UPDATE users SET failed_logins = 0, last_failed_login_at = NULL, locked_until = NULL WHERE id = $1`,
      [user.id]
    );

    if (existingToken) {
      const oldHash = hashToken(existingToken);
      await client.query(
        `UPDATE sessions SET revoked_at = now() WHERE id_hash = $1`,
        [oldHash]
      );
    }

    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + ABSOLUTE_SESSION_MS);

    await client.query(
      `INSERT INTO sessions (id_hash, user_id, expires_at, last_seen_at)
       VALUES ($1, $2, $3, now())`,
      [tokenHash, user.id, expiresAt]
    );

    logger.info({ userId: user.id }, 'User logged in successfully');

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        is_org_admin: user.is_org_admin
      }
    };
  });
}

export async function validateSession(token) {
  if (!token) return null;

  const tokenHash = hashToken(token);
  const now = new Date();

  const { rows } = await pool.query(
    `SELECT 
       s.id_hash, s.user_id, s.expires_at, s.last_seen_at, s.revoked_at,
       u.id, u.email, u.name, u.is_org_admin
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id_hash = $1`,
    [tokenHash]
  );

  const session = rows[0];
  if (!session) return null;

  // Check revoked or absolute expired
  if (session.revoked_at || new Date(session.expires_at) <= now) {
    return null;
  }

  // Check idle timeout (2 hours)
  const lastSeen = new Date(session.last_seen_at);
  if (now.getTime() - lastSeen.getTime() > IDLE_SESSION_MS) {
    return null;
  }

  // Refresh last_seen_at if more than 5 minutes elapsed (throttle idle touches)
  if (now.getTime() - lastSeen.getTime() > IDLE_TOUCH_INTERVAL_MS) {
    pool.query(
      `UPDATE sessions SET last_seen_at = now() WHERE id_hash = $1`,
      [tokenHash]
    ).catch((err) => logger.error({ err }, 'Failed to touch session last_seen_at'));
  }

  return {
    id: session.id,
    email: session.email,
    name: session.name,
    is_org_admin: session.is_org_admin,
    sessionTokenHash: session.id_hash
  };
}

export async function logout(token) {
  if (!token) return;
  const tokenHash = hashToken(token);
  await pool.query(
    `UPDATE sessions SET revoked_at = now() WHERE id_hash = $1`,
    [tokenHash]
  );
}

export async function changePassword(user, currentPassword, newPassword, currentToken) {
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 12 || newPassword.length > 128) {
    throw validationError('New password must be between 12 and 128 characters long');
  }

  if (currentPassword === newPassword) {
    throw validationError('New password must be different from current password');
  }

  // Fetch current user hash
  const { rows } = await pool.query(
    `SELECT password_hash FROM users WHERE id = $1`,
    [user.id]
  );
  if (!rows.length) throw unauthenticated();

  const valid = await argon2.verify(rows[0].password_hash, currentPassword || '');
  if (!valid) {
    // Count toward login failure throttle
    await pool.query(
      `UPDATE users
       SET failed_logins = failed_logins + 1,
           last_failed_login_at = now(),
           locked_until = CASE WHEN failed_logins + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
       WHERE id = $1`,
      [user.id]
    );
    throw invalidCredentials();
  }

  const newHash = await hashPassword(newPassword);
  const currentTokenHash = hashToken(currentToken);

  return await withTransaction(async (client) => {
    // Update password hash
    await client.query(
      `UPDATE users SET password_hash = $1, failed_logins = 0, last_failed_login_at = NULL, locked_until = NULL WHERE id = $2`,
      [newHash, user.id]
    );

    // Revoke all other sessions
    await client.query(
      `UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND id_hash <> $2 AND revoked_at IS NULL`,
      [user.id, currentTokenHash]
    );

    // Revoke current session row
    await client.query(
      `UPDATE sessions SET revoked_at = now() WHERE id_hash = $1`,
      [currentTokenHash]
    );

    // Insert new session token (rotation is revoke-plus-insert)
    const newToken = generateSessionToken();
    const newTokenHash = hashToken(newToken);
    const expiresAt = new Date(Date.now() + ABSOLUTE_SESSION_MS);

    await client.query(
      `INSERT INTO sessions (id_hash, user_id, expires_at, last_seen_at)
       VALUES ($1, $2, $3, now())`,
      [newTokenHash, user.id, expiresAt]
    );

    logger.info({ userId: user.id }, 'Password changed and sessions rotated successfully');
    return { token: newToken };
  });
}

export async function register(email, name, password, options = {}) {
  const normalizedEmail = (email || '').trim().toLowerCase();
  const trimmedName = (name || '').trim();
  const { workspace_name = null, invite_code = null, role = 'lead' } = typeof options === 'object' ? options : { role: options };

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw validationError('Please provide a valid email address');
  }
  if (!trimmedName) {
    throw validationError('Name is required');
  }
  if (!password || password.length < 8) {
    throw validationError('Password must be at least 8 characters long');
  }
  const validRoles = ['lead', 'member', 'viewer'];
  const userRole = validRoles.includes(role) ? role : 'lead';

  // Check if user already exists
  const { rows: existingRows } = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [normalizedEmail]
  );
  if (existingRows.length > 0) {
    throw validationError('An account with this email address already exists. Please sign in instead.');
  }

  // If invite code provided, validate before proceeding
  let invitation = null;
  if (invite_code) {
    const { rows: invRows } = await pool.query(
      `SELECT * FROM workspace_invitations WHERE code = $1`,
      [invite_code.trim().toUpperCase()]
    );
    if (invRows.length === 0) {
      throw validationError('Invalid invitation code');
    }
    invitation = invRows[0];
    if (invitation.used_at && invitation.code !== 'DEMO-NEWTONITE') {
      throw validationError('This invitation code has already been redeemed');
    }
    if (new Date(invitation.expires_at) < new Date() && invitation.code !== 'DEMO-NEWTONITE') {
      throw validationError('This invitation code has expired');
    }
  }

  const passwordHash = await hashPassword(password);

  return await withTransaction(async (client) => {
    // 1. Insert user
    const { rows: userRows } = await client.query(
      `INSERT INTO users (email, name, password_hash, is_org_admin)
       VALUES ($1, $2, $3, false)
       RETURNING id, email, name, is_org_admin`,
      [normalizedEmail, trimmedName, passwordHash]
    );
    const user = userRows[0];

    // 2. Setup workspace / team membership
    if (invitation) {
      // User joins invited workspace
      await client.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'member')
         ON CONFLICT (workspace_id, user_id) DO NOTHING`,
        [invitation.workspace_id, user.id]
      );

      if (invitation.team_id) {
        await client.query(
          `INSERT INTO team_memberships (team_id, user_id, role)
           VALUES ($1, $2, $3)
           ON CONFLICT (team_id, user_id) DO NOTHING`,
          [invitation.team_id, user.id, invitation.role]
        );
      } else {
        const { rows: wsTeams } = await client.query(`SELECT id FROM teams WHERE workspace_id = $1`, [invitation.workspace_id]);
        for (const t of wsTeams) {
          await client.query(
            `INSERT INTO team_memberships (team_id, user_id, role)
             VALUES ($1, $2, $3)
             ON CONFLICT (team_id, user_id) DO NOTHING`,
            [t.id, user.id, invitation.role]
          );
        }
      }

      if (invitation.code !== 'DEMO-NEWTONITE') {
        await client.query(
          `UPDATE workspace_invitations SET used_at = now(), used_by = $1 WHERE id = $2`,
          [user.id, invitation.id]
        );
      }
    } else if (workspace_name && workspace_name.trim()) {
      // User creates their own brand new workspace
      const wsName = workspace_name.trim();
      const baseSlug = wsName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'ws';
      const slug = `${baseSlug}-${crypto.randomBytes(3).toString('hex')}`;

      const { rows: wsRows } = await client.query(
        `INSERT INTO workspaces (name, slug, created_by)
         VALUES ($1, $2, $3)
         RETURNING id, name, slug`,
        [wsName, slug, user.id]
      );
      const ws = wsRows[0];

      await client.query(
        `INSERT INTO workspace_memberships (workspace_id, user_id, role)
         VALUES ($1, $2, 'owner')`,
        [ws.id, user.id]
      );

      // Create primary team in this workspace
      const letters = wsName.replace(/[^A-Za-z]/g, '').toUpperCase();
      let key = (letters.slice(0, 3) || 'OPS') + crypto.randomBytes(1).toString('hex').toUpperCase().slice(0, 2);
      const { rows: keyExists } = await client.query(`SELECT id FROM teams WHERE key = $1`, [key]);
      if (keyExists.length > 0) {
        key = `${key.slice(0, 3)}${ws.id}`;
      }

      const { rows: teamRows } = await client.query(
        `INSERT INTO teams (name, key, workspace_id)
         VALUES ($1, $2, $3)
         RETURNING id, name, key`,
        [`${wsName} Operations`, key, ws.id]
      );
      const team = teamRows[0];

      await client.query(
        `INSERT INTO team_memberships (team_id, user_id, role)
         VALUES ($1, $2, 'lead')`,
        [team.id, user.id]
      );
    }

    // 3. Create active session
    const token = generateSessionToken();
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + ABSOLUTE_SESSION_MS);

    await client.query(
      `INSERT INTO sessions (id_hash, user_id, expires_at, last_seen_at)
       VALUES ($1, $2, $3, now())`,
      [tokenHash, user.id, expiresAt]
    );

    // Load active team memberships for user object
    const { rows: memberships } = await client.query(
      `SELECT t.id, t.name, t.key, tm.role, t.workspace_id, w.name AS workspace_name
       FROM team_memberships tm
       JOIN teams t ON t.id = tm.team_id
       LEFT JOIN workspaces w ON w.id = t.workspace_id
       WHERE tm.user_id = $1 AND tm.removed_at IS NULL
       ORDER BY t.name`,
      [user.id]
    );

    const { rows: workspaces } = await client.query(
      `SELECT w.id, w.name, w.slug, wm.role
       FROM workspace_memberships wm
       JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.user_id = $1
       ORDER BY wm.created_at ASC`,
      [user.id]
    );

    logger.info({ userId: user.id, email: user.email }, 'User registered successfully');

    return {
      token,
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
}

