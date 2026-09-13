import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_URL: z.string().url().optional().default('http://localhost:3000'),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().min(1, 'TELEGRAM_BOT_TOKEN is required').default('dummy_token_for_dev_test'),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(1, 'TELEGRAM_WEBHOOK_SECRET is required').default('dev_webhook_secret_key_123'),

  // OpenAI (legacy/compat)
  OPENAI_API_KEY: z.string().optional().default(''),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),

  // AI Providers
  GEMINI_API_KEY: z.string().optional().default(''),
  GEMINI_PRIMARY_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_FAST_MODEL: z.string().default('gemini-2.5-flash-lite'),

  GROK_API_KEY: z.string().optional().default(''),
  GROK_MODEL: z.string().default('grok-4.6'),

  OPENROUTER_API_KEY: z.string().optional().default(''),
  OPENROUTER_MODEL: z.string().default('openrouter/free'),

  AI_REQUEST_TIMEOUT_MS: z.coerce.number().default(30000),

  // Database
  DATABASE_URL: z.string().optional().default('postgresql://postgres:postgres@localhost:5432/medai?schema=public'),

  // Storage
  STORAGE_TYPE: z.enum(['local', 's3']).default('local'),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  STORAGE_BUCKET: z.string().default('medai-documents'),
  LOCAL_STORAGE_DIR: z.string().default('./uploads'),

  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info')
});

export type EnvConfig = z.infer<typeof envSchema>;

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:', parsedEnv.error.format());
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

export const env: EnvConfig = parsedEnv.success
  ? parsedEnv.data
  : envSchema.parse({
      TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || 'dummy_token_for_dev_test',
      TELEGRAM_WEBHOOK_SECRET: process.env.TELEGRAM_WEBHOOK_SECRET || 'dev_webhook_secret_key_123'
    });
