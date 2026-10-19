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
  if (origin && config.appOrigin && config.appOrigin !== '*') {
    try {
      const allowedOrigins = config.appOrigin.split(',').map((o) => {
        try {
          return new URL(o.trim()).origin;
        } catch {
          return o.trim();
        }
      });
      const normalizedRequestOrigin = new URL(origin).origin;
      if (!allowedOrigins.includes(normalizedRequestOrigin) && !allowedOrigins.includes('*')) {
        throw csrfError('Origin header does not match allowed application origin');
      }
    } catch (err) {
      if (err.code === 'CSRF_FAILED') throw err;
    }
  } else if (config.isProduction && !origin && !request.headers['x-requested-by']) {
    throw csrfError('Origin header is required on mutating requests');
  }
}
