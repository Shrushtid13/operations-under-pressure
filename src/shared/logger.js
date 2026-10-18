// src/shared/logger.js
import pino from 'pino';
import { config } from './config.js';

const redactPaths = [
  'req.headers.cookie',
  'req.headers["set-cookie"]',
  'req.headers.authorization',
  'headers.cookie',
  'headers["set-cookie"]',
  'headers.authorization',
  'body.password',
  'body.current_password',
  'body.new_password',
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'token',
  'token_hash'
];

export const logger = pino({
  level: config.isProduction ? 'info' : 'debug',
  redact: {
    paths: redactPaths,
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  transport: config.isProduction ? undefined : {
    target: 'pino-pretty',
    options: {
      colorize: true,
      ignore: 'pid,hostname',
      translateTime: 'SYS:standard'
    }
  }
});
