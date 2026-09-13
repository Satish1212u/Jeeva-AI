import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Health and Telegram Webhook Endpoints', () => {
  it('GET /health should return 200 and status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('GET /health/providers should return status ok and provider health dictionary', async () => {
    const res = await request(app).get('/health/providers');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.providers).toBeDefined();
    expect(res.body.providers['gemini-flash']).toBeDefined();
    expect(res.body.providers['gemini-flash-lite']).toBeDefined();
    expect(res.body.providers['grok']).toBeDefined();
    expect(res.body.providers['openrouter']).toBeDefined();
  });

  it('POST /webhook/telegram should reject request with missing or invalid secret token (401)', async () => {
    const res = await request(app)
      .post('/webhook/telegram')
      .set('x-telegram-bot-api-secret-token', 'wrong_secret_token')
      .send({ update_id: 12345 });

    expect(res.status).toBe(401);
    expect(res.body.error).toContain('Unauthorized');
  });

  it('POST /webhook/telegram should accept request with valid secret token', async () => {
    const res = await request(app)
      .post('/webhook/telegram')
      .set('x-telegram-bot-api-secret-token', env.TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 12345,
        message: {
          message_id: 1,
          from: { id: 99999, first_name: 'TestUser' },
          chat: { id: 99999, type: 'private' },
          text: '/start'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('POST /webhook/telegram should process /help command without error', async () => {
    const res = await request(app)
      .post('/webhook/telegram')
      .set('x-telegram-bot-api-secret-token', env.TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 12346,
        message: {
          message_id: 2,
          from: { id: 99999, first_name: 'TestUser' },
          chat: { id: 99999, type: 'private' },
          text: '/help'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it('POST /webhook/telegram should process inline callback query', async () => {
    const res = await request(app)
      .post('/webhook/telegram')
      .set('x-telegram-bot-api-secret-token', env.TELEGRAM_WEBHOOK_SECRET)
      .send({
        update_id: 12347,
        callback_query: {
          id: 'cb_query_1',
          from: { id: 99999, first_name: 'TestUser' },
          message: { chat: { id: 99999 }, message_id: 1 },
          data: 'action:ask_question'
        }
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
