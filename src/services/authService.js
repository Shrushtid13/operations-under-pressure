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
