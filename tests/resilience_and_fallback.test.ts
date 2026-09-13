import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageHandler, getLocalizedErrorMessage } from '../src/bot/handlers/messageHandler.js';
import { telegramBot } from '../src/bot/telegramBot.js';
import { aiRouter, AIRouter } from '../src/ai/aiRouter.js';
import { AIProvider } from '../src/ai/providers/types.js';
import { ConversationService } from '../src/conversations/conversationService.js';
import { UserService } from '../src/users/userService.js';
import { processingIndicator } from '../src/bot/processingIndicator.js';
import request from 'supertest';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

describe('Resilience, Fallbacks & Error Boundaries', () => {
  const testChatId = 77712345;
  const testUserMeta = { id: 77712345, firstName: 'TestUser', username: 'testuser' };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(telegramBot, 'sendChatAction').mockResolvedValue(true);
    vi.spyOn(telegramBot, 'deleteMessage').mockResolvedValue(true);
    vi.spyOn(telegramBot, 'sendMessageWithId').mockResolvedValue(123);
  });

  afterEach(async () => {
    await processingIndicator.stopProcessing(testChatId);
    vi.restoreAllMocks();
  });

  // 1. Normal AI response
  it('normal AI response executes, manages indicator lifecycle, and sends answer', async () => {
    const sendMessageSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'Blood pressure ranges are typically 120/80 mmHg.', provider: 'gemini-flash', model: 'gemini' },
      guardResult: { content: 'Blood pressure ranges are typically 120/80 mmHg.', isSanitized: false, violations: [] },
      providerUsed: 'gemini-flash',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    await MessageHandler.handleTextMessage(testChatId, 'What are normal blood pressure ranges?', testUserMeta);

    expect(sendMessageSpy).toHaveBeenCalled();
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
  });

  // 2. Gemini failure -> Grok fallback
  it('falls back to Grok when Gemini fails', async () => {
    const failingGemini: AIProvider = {
      name: 'gemini-flash',
      defaultModel: 'gemini-2.5-flash',
      isAvailable: async () => true,
      generateText: async () => {
        throw new Error('Gemini quota exhausted');
      }
    };

    const mockGrok: AIProvider = {
      name: 'grok',
      defaultModel: 'grok-4.6',
      isAvailable: async () => true,
      generateText: async () => ({
        content: 'Blood pressure of 120/80 mmHg is considered optimal.',
        provider: 'grok',
        model: 'grok-4.6',
        latencyMs: 100
      })
    };

    const customRouter = new AIRouter({
      primaryMedical: failingGemini,
      secondaryFallback: mockGrok
    });

    const result = await customRouter.execute({
      requestType: 'medical_request',
      prompt: 'Normal blood pressure'
    });

    expect(result.providerUsed).toBe('grok');
    expect(result.fallbackUsed).toBe(true);
    expect(result.response.content).toContain('120/80');
  });

  // 3. Gemini + Grok failure -> OpenRouter
  it('falls back to OpenRouter when both Gemini and Grok fail', async () => {
    const failingGemini: AIProvider = {
      name: 'gemini-flash',
      defaultModel: 'gemini-2.5-flash',
      isAvailable: async () => true,
      generateText: async () => {
        throw new Error('Gemini unavailable');
      }
    };

    const failingGrok: AIProvider = {
      name: 'grok',
      defaultModel: 'grok-4.6',
      isAvailable: async () => true,
      generateText: async () => {
        throw new Error('Grok rate limit');
      }
    };

    const mockOpenRouter: AIProvider = {
      name: 'openrouter',
      defaultModel: 'openrouter/model',
      isAvailable: async () => true,
      generateText: async () => ({
        content: 'OpenRouter fallback response regarding wellness.',
        provider: 'openrouter',
        model: 'openrouter/model',
        latencyMs: 200
      })
    };

    const customRouter = new AIRouter({
      primaryMedical: failingGemini,
      secondaryFallback: failingGrok,
      tertiaryFallback: mockOpenRouter
    });

    const result = await customRouter.execute({
      requestType: 'medical_request',
      prompt: 'Wellness advice'
    });

    expect(result.providerUsed).toBe('openrouter');
    expect(result.fallbackUsed).toBe(true);
    expect(result.response.content).toContain('OpenRouter fallback response');
  });

  // 4. All providers fail
  it('returns structured safe medical error when all providers fail', async () => {
    const failingProvider = (name: string): AIProvider => ({
      name,
      defaultModel: 'default',
      isAvailable: async () => true,
      generateText: async () => {
        throw new Error(`${name} failed`);
      }
    });

    const customRouter = new AIRouter({
      primaryMedical: failingProvider('gemini-flash'),
      secondaryFallback: failingProvider('grok'),
      tertiaryFallback: failingProvider('openrouter')
    });

    const result = await customRouter.execute({
      requestType: 'medical_request',
      prompt: 'Medical question'
    });

    expect(result.providerUsed).toBe('fallback-system');
    expect(result.fallbackUsed).toBe(true);
    expect(result.response.content).toContain('experiencing high demand');
  });

  // 5. Empty AI output continues fallback
  it('treats empty or whitespace AI output as provider failure and continues fallback', async () => {
    const emptyGemini: AIProvider = {
      name: 'gemini-flash',
      defaultModel: 'gemini-2.5-flash',
      isAvailable: async () => true,
      generateText: async () => ({
        content: '   \n  ', // Whitespace only
        provider: 'gemini-flash',
        model: 'gemini-2.5-flash'
      })
    };

    const mockGrok: AIProvider = {
      name: 'grok',
      defaultModel: 'grok-4.6',
      isAvailable: async () => true,
      generateText: async () => ({
        content: 'Grok non-empty valid response.',
        provider: 'grok',
        model: 'grok-4.6'
      })
    };

    const customRouter = new AIRouter({
      primaryMedical: emptyGemini,
      secondaryFallback: mockGrok
    });

    const result = await customRouter.execute({
      requestType: 'medical_request',
      prompt: 'Check hemoglobin'
    });

    expect(result.providerUsed).toBe('grok');
    expect(result.fallbackUsed).toBe(true);
    expect(result.response.content).toBe('Grok non-empty valid response.');
  });

  // 6. DB append failure AFTER successful AI response
  it('delivers AI response to Telegram even if ConversationService.appendMessage fails after AI generation', async () => {
    const sendMessageSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);

    // Mock AI router to return a valid message
    vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'AI generated health answer.', provider: 'gemini-flash', model: 'gemini' },
      guardResult: { content: 'AI generated health answer.', isSanitized: false, violations: [] },
      providerUsed: 'gemini-flash',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    // Mock appendMessage: first call (USER message) succeeds, second call (ASSISTANT message) throws
    let callCount = 0;
    vi.spyOn(ConversationService, 'appendMessage').mockImplementation(async () => {
      callCount++;
      if (callCount >= 2) {
        throw new Error('Simulated DB connection failure while saving assistant reply');
      }
    });

    await MessageHandler.handleTextMessage(testChatId, 'I have a headache', testUserMeta);

    // Response must still be delivered to Telegram!
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: 'AI generated health answer.'
      })
    );
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
  });

  // 7. AI execution exception
  it('catches AI execution exception, stops indicator, and sends user-facing fallback', async () => {
    const sendMessageSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);

    vi.spyOn(aiRouter, 'execute').mockRejectedValueOnce(new Error('Fatal unhandled AI engine exception'));

    await MessageHandler.handleTextMessage(testChatId, 'How to treat burns?', testUserMeta);

    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining("⚠️ Jeeva AI couldn't complete that request right now.")
      })
    );
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
  });

  // 8. Telegram send failure retry
  it('retries sendMessage without parse_mode if attempt 1 fails', async () => {
    // In telegramBot, test retry behavior
    const httpSpy = vi.spyOn((telegramBot as any).http, 'post');
    // First call rejects with 400 bad markdown, second call succeeds
    httpSpy
      .mockRejectedValueOnce({
        response: { data: { description: "Bad Request: can't parse entities in message" } }
      })
      .mockResolvedValueOnce({ data: { ok: true } });

    // Temporarily disable simulated check to exercise HTTP logic
    vi.spyOn(telegramBot as any, 'isSimulated', 'get').mockReturnValue(false);

    const result = await telegramBot.sendMessage({
      chat_id: testChatId,
      text: '*Unclosed markdown formatting',
      parse_mode: 'Markdown'
    });

    expect(result).toBe(true);
    expect(httpSpy).toHaveBeenCalledTimes(2);
    // Second call should have parse_mode undefined
    expect(httpSpy.mock.calls[1][1]).toMatchObject({
      chat_id: testChatId,
      text: '*Unclosed markdown formatting',
      parse_mode: undefined
    });
  });

  // 9. MessageHandler catches unexpected exception with localized fallbacks
  it('top-level error boundary catches unexpected user service exception and sends localized fallback', async () => {
    const sendMessageSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);

    vi.spyOn(UserService, 'getOrCreateUser').mockRejectedValueOnce(new Error('Critical DB crash'));

    // English
    await MessageHandler.handleTextMessage(testChatId, 'Hello doctor', testUserMeta);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId
      })
    );
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
  });

  it('provides correct localized fallback messages for English, Hindi, and Hinglish', () => {
    expect(getLocalizedErrorMessage('en')).toContain("⚠️ Jeeva AI couldn't complete that request right now.");
    expect(getLocalizedErrorMessage('hi')).toContain('⚠️ Jeeva AI अभी इस request को पूरा नहीं कर पाया।');
    expect(getLocalizedErrorMessage('hinglish')).toContain('⚠️ Jeeva AI abhi request process nahi kar paaya.');
  });

  // 10 & 11. Processing indicator cleanup on success and failure
  it('cleans up processing indicator on successful query', async () => {
    vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'CBC test explanation.', provider: 'gemini-flash', model: 'gemini' },
      guardResult: { content: 'CBC test explanation.', isSanitized: false, violations: [] },
      providerUsed: 'gemini-flash',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    await MessageHandler.handleTextMessage(testChatId, 'Explain CBC test', testUserMeta);

    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
    expect(processingIndicator.getSession(testChatId)).toBeUndefined();
  });

  it('cleans up processing indicator on unexpected crash', async () => {
    vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockRejectedValueOnce(new Error('Crash inside AI router'));

    await MessageHandler.handleTextMessage(testChatId, 'Explain lipid profile', testUserMeta);

    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
    expect(processingIndicator.getSession(testChatId)).toBeUndefined();
  });

  // 12. No silent user failure in app.ts webhook
  it('webhook error fallback sends message to Telegram and returns 200 when handler throws', async () => {
    const sendMessageSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);

    // Force MessageHandler to throw unexpectedly
    vi.spyOn(MessageHandler, 'handleTextMessage').mockRejectedValueOnce(
      new Error('Catastrophic failure in message handler')
    );

    const res = await request(app)
      .post('/webhook/telegram')
      .set('x-telegram-bot-api-secret-token', env.TELEGRAM_WEBHOOK_SECRET || '')
      .send({
        update_id: 99991,
        message: {
          message_id: 1,
          chat: { id: testChatId, type: 'private' },
          from: { id: testChatId, first_name: 'Test' },
          text: 'What should I eat for diabetes?'
        }
      });

    // Webhook must return 200 OK to Telegram
    expect(res.status).toBe(200);

    // Fallback message must be delivered to user - no silent failure!
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining("⚠️ Jeeva AI couldn't complete that request right now.")
      })
    );
  });
});
