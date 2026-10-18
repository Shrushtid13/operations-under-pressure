// src/api/hooks/csrfHook.js
import { config } from '../../shared/config.js';
import { csrfError, unsupportedMediaType } from '../../shared/errors.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export async function csrfHook(request, reply) {
  if (SAFE_METHODS.has(request.method)) {
    return;
  }

  // Check 1: Content-Type must be application/json
  const contentType = request.headers['content-type'] || '';
  if (!contentType.includes('application/json')) {
    throw unsupportedMediaType('Content-Type must be application/json');
  }

  // Check 2: Custom header X-Requested-By must be present
  const requestedBy = request.headers['x-requested-by'];
  if (!requestedBy) {
    throw csrfError('Missing required X-Requested-By header');
  }

  // Check 3: Origin check if present
  const origin = request.headers['origin'];
  if (origin) {
    const normalizedAppOrigin = new URL(config.appOrigin).origin;
    const normalizedRequestOrigin = new URL(origin).origin;
    if (normalizedAppOrigin !== normalizedRequestOrigin) {
      throw csrfError('Origin header does not match allowed application origin');
    }
  } else if (config.isProduction) {
    // In production, browser origin header is strictly required on state-changing requests
    throw csrfError('Origin header is required on mutating requests');
  }
}
