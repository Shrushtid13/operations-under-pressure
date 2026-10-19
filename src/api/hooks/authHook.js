// src/api/hooks/authHook.js
import { validateSession } from '../../services/authService.js';
import { unauthenticated, serviceUnavailable } from '../../shared/errors.js';
import { logger } from '../../shared/logger.js';

const PUBLIC_PREFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/logout',
  '/workspaces/invitations',
  '/healthz',
  '/readyz'
];

export async function authHook(request, reply) {
  const url = request.url.split('?')[0];

  // Check public routes
  if (PUBLIC_PREFIXES.some((prefix) => url === prefix || url.startsWith(prefix + '/'))) {
    return;
  }

  // Extract session token from cookie or Authorization header
  let token = request.cookies?.session_token;
  if (!token && request.headers.authorization) {
    const parts = request.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    throw unauthenticated('Authentication session required');
  }

  try {
    const user = await validateSession(token);
    if (!user) {
      throw unauthenticated('Session expired or revoked');
    }
    request.user = user;
    request.sessionToken = token;
  } catch (err) {
    // If database was unavailable or timed out, return 503 UNAVAILABLE, never 401!
    if (err.status === 503 || err.code === 'UNAVAILABLE' || err.code === '57014' || err.code === '08006') {
      throw serviceUnavailable('Database unavailable during session verification');
    }
    if (err.status === 401) {
      throw err;
    }
    logger.error({ err }, 'Error during session authentication hook');
    throw serviceUnavailable('Authentication verification error');
  }
}
