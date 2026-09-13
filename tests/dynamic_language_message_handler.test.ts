import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MessageHandler } from '../src/bot/handlers/messageHandler.js';
import { telegramBot } from '../src/bot/telegramBot.js';
import { aiRouter } from '../src/ai/aiRouter.js';
import { UserService } from '../src/users/userService.js';
import { ConversationService } from '../src/conversations/conversationService.js';
import { processingIndicator } from '../src/bot/processingIndicator.js';

describe('MessageHandler Dynamic Language & Guaranteed Response Suite', () => {
  const testChatId = 99887766;
  const testUserMeta = { id: 99887766, firstName: 'Aarav', username: 'aarav_test' };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(telegramBot, 'sendChatAction').mockResolvedValue(true);
    vi.spyOn(telegramBot, 'deleteMessage').mockResolvedValue(true);
    vi.spyOn(telegramBot, 'sendMessageWithId').mockResolvedValue(12345);
    vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
  });

  afterEach(async () => {
    await processingIndicator.stopProcessing(testChatId);
    vi.restoreAllMocks();
  });

  // 1. English message -> English response
  it('1. English message routes to English AI response', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'Normal Hb levels are 13.5 to 17.5 g/dL.', provider: 'gemini-flash-lite', model: 'gemini' },
      guardResult: { content: 'Normal Hb levels are 13.5 to 17.5 g/dL.', isSanitized: false, violations: [] },
      providerUsed: 'gemini-flash-lite',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    await MessageHandler.handleTextMessage(testChatId, 'Tell me why my Hb is low?', testUserMeta);

    expect(aiSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Tell me why my Hb is low?' }),
      'en'
    );
  });

  // 2. Hinglish message -> Hinglish response
  it('2. Hinglish message routes to Hinglish AI response', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'Aapka Hb level low hone ke kai reasons ho sakte hain.', provider: 'gemini-flash-lite', model: 'gemini' },
      guardResult: { content: 'Aapka Hb level low hone ke kai reasons ho sakte hain.', isSanitized: false, violations: [] },
      providerUsed: 'gemini-flash-lite',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    await MessageHandler.handleTextMessage(testChatId, 'Mera Hb kam hai iska kya matlab hai?', testUserMeta);

    expect(aiSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'Mera Hb kam hai iska kya matlab hai?' }),
      'hinglish'
    );
  });

  // 3. Hindi message -> Hindi response
  it('3. Hindi message routes to Hindi (Devanagari) AI response', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'हीमोग्लोबिन कम होने के कई कारण हो सकते हैं।', provider: 'gemini-flash-lite', model: 'gemini' },
      guardResult: { content: 'हीमोग्लोबिन कम होने के कई कारण हो सकते हैं।', isSanitized: false, violations: [] },
      providerUsed: 'gemini-flash-lite',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    await MessageHandler.handleTextMessage(testChatId, 'मेरा Hb कम है इसका क्या मतलब है?', testUserMeta);

    expect(aiSpy).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: 'मेरा Hb कम है इसका क्या मतलब है?' }),
      'hi'
    );
  });

  // 4. English -> Hinglish in next message
  it('4. English -> Hinglish switches dynamically in consecutive messages', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute')
      .mockResolvedValueOnce({
        response: { content: 'English response', provider: 'gemini', model: 'gemini' },
        guardResult: { content: 'English response', isSanitized: false, violations: [] },
        providerUsed: 'gemini',
        fallbackUsed: false,
        retriesAttempted: 0
      })
      .mockResolvedValueOnce({
        response: { content: 'Hinglish response', provider: 'gemini', model: 'gemini' },
        guardResult: { content: 'Hinglish response', isSanitized: false, violations: [] },
        providerUsed: 'gemini',
        fallbackUsed: false,
        retriesAttempted: 0
      });

    await MessageHandler.handleTextMessage(testChatId, 'Can you explain this report?', testUserMeta);
    expect(aiSpy).toHaveBeenNthCalledWith(1, expect.anything(), 'en');

    await MessageHandler.handleTextMessage(testChatId, 'ye report samjha do', testUserMeta);
    expect(aiSpy).toHaveBeenNthCalledWith(2, expect.anything(), 'hinglish');
  });

  // 5. Hinglish -> English in next message
  it('5. Hinglish -> English switches dynamically in consecutive messages', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute')
      .mockResolvedValueOnce({
        response: { content: 'Hinglish response', provider: 'gemini', model: 'gemini' },
        guardResult: { content: 'Hinglish response', isSanitized: false, violations: [] },
        providerUsed: 'gemini',
        fallbackUsed: false,
        retriesAttempted: 0
      })
      .mockResolvedValueOnce({
        response: { content: 'English response', provider: 'gemini', model: 'gemini' },
        guardResult: { content: 'English response', isSanitized: false, violations: [] },
        providerUsed: 'gemini',
        fallbackUsed: false,
        retriesAttempted: 0
      });

    await MessageHandler.handleTextMessage(testChatId, 'kya karu doctor', testUserMeta);
    expect(aiSpy).toHaveBeenNthCalledWith(1, expect.anything(), 'hinglish');

    await MessageHandler.handleTextMessage(testChatId, 'What should I do now?', testUserMeta);
    expect(aiSpy).toHaveBeenNthCalledWith(2, expect.anything(), 'en');
  });

  // 6. Hindi -> English in next message
  it('6. Hindi -> English switches dynamically in consecutive messages', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute')
      .mockResolvedValueOnce({
        response: { content: 'Hindi response', provider: 'gemini', model: 'gemini' },
        guardResult: { content: 'Hindi response', isSanitized: false, violations: [] },
        providerUsed: 'gemini',
        fallbackUsed: false,
        retriesAttempted: 0
      })
      .mockResolvedValueOnce({
        response: { content: 'English response', provider: 'gemini', model: 'gemini' },
        guardResult: { content: 'English response', isSanitized: false, violations: [] },
        providerUsed: 'gemini',
        fallbackUsed: false,
        retriesAttempted: 0
      });

    await MessageHandler.handleTextMessage(testChatId, 'मुझे बुखार है', testUserMeta);
    expect(aiSpy).toHaveBeenNthCalledWith(1, expect.anything(), 'hi');

    await MessageHandler.handleTextMessage(testChatId, 'I have fever', testUserMeta);
    expect(aiSpy).toHaveBeenNthCalledWith(2, expect.anything(), 'en');
  });

  // 7. Saved preferred language must NOT override current clearly detected language
  it('7. Saved preferred language does NOT override clearly detected current message language', async () => {
    vi.spyOn(UserService, 'getOrCreateUser').mockResolvedValueOnce({
      id: 'saved-user-1',
      telegramId: String(testUserMeta.id),
      displayName: testUserMeta.firstName,
      preferredLanguage: 'en', // Saved as English
      familyProfiles: [{ id: 'p-1', name: 'Self', relationship: 'SELF' }]
    } as any);

    const aiSpy = vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'Hinglish advice', provider: 'gemini', model: 'gemini' },
      guardResult: { content: 'Hinglish advice', isSanitized: false, violations: [] },
      providerUsed: 'gemini',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    // User sends Hinglish message
    await MessageHandler.handleTextMessage(testChatId, 'mere stomach me pain hai', testUserMeta);

    // AI router MUST be called with 'hinglish', not 'en'
    expect(aiSpy).toHaveBeenCalledWith(expect.anything(), 'hinglish');
  });

  // 8. Emergency response follows current language
  it('8. Emergency response follows current language for English, Hindi, and Hinglish', async () => {
    const sendSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);

    // English
    await MessageHandler.handleTextMessage(testChatId, 'I have severe chest pain', testUserMeta);
    expect(sendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining('URGENT MEDICAL ALERT')
      })
    );

    // Hinglish
    await MessageHandler.handleTextMessage(testChatId, 'mere seene mein bahut dard hai', testUserMeta);
    expect(sendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining('Aapke bataye hue symptoms')
      })
    );

    // Hindi
    await MessageHandler.handleTextMessage(testChatId, 'मेरे सीने में बहुत दर्द है', testUserMeta);
    expect(sendSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining('आपातकालीन चिकित्सा चेतावनी')
      })
    );
  });

  // 9. Provider failure follows current language
  it('9. Provider failure fallback follows current message language', async () => {
    const aiSpy = vi.spyOn(aiRouter, 'execute').mockImplementation(async (_req, lang) => {
      const msg = lang === 'hinglish'
        ? '⚠️ Jeeva AI abhi request process nahi kar paaya.\nThodi der baad dobara try karein.'
        : "⚠️ Jeeva AI couldn't complete that request right now.";
      return {
        response: { content: msg, provider: 'fallback-system', model: 'none' },
        guardResult: { content: msg, isSanitized: false, violations: [] },
        providerUsed: 'fallback-system',
        fallbackUsed: true,
        retriesAttempted: 0
      };
    });

    const sendSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);

    await MessageHandler.handleTextMessage(testChatId, 'ye report samjhao', testUserMeta);

    expect(aiSpy).toHaveBeenCalledWith(expect.anything(), 'hinglish');
    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining('⚠️ Jeeva AI abhi request process nahi kar paaya.')
      })
    );
  });

  // 10. DB failure still sends response
  it('10. DB message append failure after AI generation still delivers AI response', async () => {
    const sendSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'Healthy diet recommendations.', provider: 'gemini', model: 'gemini' },
      guardResult: { content: 'Healthy diet recommendations.', isSanitized: false, violations: [] },
      providerUsed: 'gemini',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    vi.spyOn(ConversationService, 'appendMessage').mockRejectedValue(new Error('PostgreSQL timeout'));

    await MessageHandler.handleTextMessage(testChatId, 'What should I eat?', testUserMeta);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: 'Healthy diet recommendations.'
      })
    );
  });

  // 11. AI exception still sends fallback response in current language
  it('11. AI exception still sends localized fallback response in current language', async () => {
    const sendSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockRejectedValueOnce(new Error('AI Engine Crash'));

    await MessageHandler.handleTextMessage(testChatId, 'kya karu', testUserMeta);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining('⚠️ Jeeva AI abhi request process nahi kar paaya.')
      })
    );
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
  });

  // 12. All providers failing still sends fallback in current language
  it('12. All providers failing still sends fallback in current language', async () => {
    const sendSpy = vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockRejectedValueOnce(new Error('All providers offline'));

    await MessageHandler.handleTextMessage(testChatId, 'मुझे बुखार है', testUserMeta);

    expect(sendSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        chat_id: testChatId,
        text: expect.stringContaining('⚠️ Jeeva AI अभी इस request को पूरा नहीं कर पाया।')
      })
    );
  });

  // 13. Processing indicator always cleans up
  it('13. Processing indicator always cleans up on success and failure', async () => {
    vi.spyOn(telegramBot, 'sendMessage').mockResolvedValue(true);
    vi.spyOn(aiRouter, 'execute').mockResolvedValueOnce({
      response: { content: 'Success', provider: 'gemini', model: 'gemini' },
      guardResult: { content: 'Success', isSanitized: false, violations: [] },
      providerUsed: 'gemini',
      fallbackUsed: false,
      retriesAttempted: 0
    });

    await MessageHandler.handleTextMessage(testChatId, 'namaste', testUserMeta);
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);

    vi.spyOn(aiRouter, 'execute').mockRejectedValueOnce(new Error('Catastrophic failure'));
    await MessageHandler.handleTextMessage(testChatId, 'help', testUserMeta);
    expect(processingIndicator.isProcessing(testChatId)).toBe(false);
  });
});
