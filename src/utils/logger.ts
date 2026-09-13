import pino from 'pino';
import { env } from '../config/env.js';

// Redact sensitive patterns in logs
const SENSITIVE_KEYS = [
  'token',
  'secret',
  'apiKey',
  'authorization',
  'password',
  'DATABASE_URL',
  'TELEGRAM_BOT_TOKEN',
  'OPENAI_API_KEY',
  'TELEGRAM_WEBHOOK_SECRET'
];

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: SENSITIVE_KEYS.flatMap((key) => [
      key,
      `*.${key}`,
      `*.*.${key}`,
      `req.headers["x-telegram-bot-api-secret-token"]`
    ]),
    censor: '[REDACTED]'
  },
  transport:
    env.NODE_ENV === 'development'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname'
          }
        }
      : undefined
});
