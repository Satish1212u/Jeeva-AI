import express, { Request, Response, NextFunction } from 'express';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { MessageHandler } from './bot/handlers/messageHandler.js';
import { DocumentHandler } from './bot/handlers/documentHandler.js';
import { CallbackHandler } from './bot/handlers/callbackHandler.js';
import { providerHealth } from './ai/providerHealth.js';

export const app = express();

// Parse JSON bodies
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple in-memory rate limiter per IP / chat to prevent abuse
const requestTracker = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;

app.use((req: Request, res: Response, next: NextFunction): void => {
  const clientIp = req.ip || 'unknown';
  const now = Date.now();
  const tracking = requestTracker.get(clientIp);

  if (!tracking || now > tracking.resetAt) {
    requestTracker.set(clientIp, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    next();
    return;
  }

  if (tracking.count >= MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({ error: 'Too many requests. Please try again in a minute.' });
    return;
  }

  tracking.count++;
  next();
});

/**
 * Health check endpoint
 */
app.get('/health', (req: Request, res: Response): void => {
  if (req.query.detailed === 'true') {
    res.status(200).json({
      status: 'ok',
      providers: providerHealth.getHealthStatus()
    });
    return;
  }
  res.status(200).json({ status: 'ok' });
});

/**
 * Provider Health Status endpoint
 */
app.get('/health/providers', (_req: Request, res: Response): void => {
  res.status(200).json({
    status: 'ok',
    providers: providerHealth.getHealthStatus()
  });
});

/**
 * Telegram Webhook Handler
 */
app.post('/webhook/telegram', async (req: Request, res: Response): Promise<void> => {
  const secretHeader = req.headers['x-telegram-bot-api-secret-token'];

  // 1. Validate webhook secret token
  if (env.TELEGRAM_WEBHOOK_SECRET && secretHeader !== env.TELEGRAM_WEBHOOK_SECRET) {
    logger.warn(
      { receivedSecret: secretHeader ? '[REDACTED_MISMATCH]' : 'MISSING' },
      'Unauthorized webhook access attempt rejected.'
    );
    res.status(401).json({ error: 'Unauthorized: invalid secret token' });
    return;
  }

  const update = req.body;

  // Telegram expects 200 OK fast; process update
  res.status(200).json({ ok: true });

  if (!update || typeof update !== 'object') {
    return;
  }

  try {
    // A. Handle Callback Queries (inline keyboard button clicks)
    if (update.callback_query) {
      await CallbackHandler.handleCallback(update.callback_query);
      return;
    }

    // B. Handle Messages
    if (update.message) {
      const msg = update.message;
      const chatId = msg.chat?.id;
      const userMeta = {
        id: msg.from?.id,
        firstName: msg.from?.first_name,
        username: msg.from?.username
      };

      if (!chatId || !userMeta.id) {
        return;
      }

      // Photos
      if (msg.photo && Array.isArray(msg.photo) && msg.photo.length > 0) {
        await DocumentHandler.handlePhoto(chatId, msg.photo, msg.caption, userMeta);
        return;
      }

      // Documents (PDFs, images sent as raw files)
      if (msg.document) {
        await DocumentHandler.handleDocument(chatId, msg.document, msg.caption, userMeta);
        return;
      }

      // Text queries
      if (msg.text) {
        await MessageHandler.handleTextMessage(chatId, msg.text, userMeta);
        return;
      }
    }
  } catch (error: any) {
    logger.error({ err: error.message, stack: error.stack }, 'Error processing Telegram update.');
  }
});

// 404 handler
app.use((_req: Request, res: Response): void => {
  res.status(404).json({ error: 'Not Found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  logger.error({ err: err.message, stack: err.stack }, 'Unhandled application error.');
  res.status(500).json({ error: 'Internal Server Error' });
});
