import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ProcessingIndicatorService,
  STATUS_PRESETS,
  ProcessingType
} from '../src/bot/processingIndicator.js';
import { telegramBot } from '../src/bot/telegramBot.js';
import { ResponseGuard } from '../src/ai/responseGuard.js';

describe('ProcessingIndicator UX & Safety', () => {
  let indicator: ProcessingIndicatorService;
  const testChatId = 987654321;

  beforeEach(() => {
    indicator = new ProcessingIndicatorService();
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    await indicator.stopProcessing(testChatId);
    vi.clearAllTimers();
  });

  it('processing indicator starts and sends typing chat action immediately', async () => {
    const sendChatActionSpy = vi.spyOn(telegramBot, 'sendChatAction').mockResolvedValue(true);
    const sendMessageSpy = vi
      .spyOn(telegramBot, 'sendMessageWithId')
      .mockResolvedValue(12345);

    const messageId = await indicator.startProcessing(testChatId, 'health_question');

    expect(sendChatActionSpy).toHaveBeenCalledWith(testChatId, 'typing');
    expect(sendMessageSpy).toHaveBeenCalledWith({
      chat_id: testChatId,
      text: '🧠 Jeeva AI is thinking...'
    });
    expect(messageId).toBe(12345);
    expect(indicator.isProcessing(testChatId)).toBe(true);
  });

  it('sends correct contextual status message for specialized types', async () => {
    vi.spyOn(telegramBot, 'sendChatAction').mockResolvedValue(true);
    vi.spyOn(telegramBot, 'deleteMessage').mockResolvedValue(true);
    const sendMessageSpy = vi
      .spyOn(telegramBot, 'sendMessageWithId')
      .mockResolvedValue(999);

    const types: ProcessingType[] = [
      'text',
      'report',
      'prescription',
      'medicine',
      'image',
      'generic'
    ];

    for (const type of types) {
      await indicator.startProcessing(testChatId, type);
      const expectedText = STATUS_PRESETS[type][0];
      expect(sendMessageSpy).toHaveBeenCalledWith({
        chat_id: testChatId,
        text: expectedText
      });
      await indicator.stopProcessing(testChatId);
    }
  });

  it('status is updated via editMessageText', async () => {
    vi.spyOn(telegramBot, 'sendMessageWithId').mockResolvedValue(55555);
    const editMessageSpy = vi.spyOn(telegramBot, 'editMessageText').mockResolvedValue(true);

    await indicator.startProcessing(testChatId, 'lab_report');
    const updated = await indicator.updateProcessing(testChatId, '🔎 Checking the reported values...');

    expect(updated).toBe(true);
    expect(editMessageSpy).toHaveBeenCalledWith(
      testChatId,
      55555,
      '🔎 Checking the reported values...'
    );

    const session = indicator.getSession(testChatId);
    expect(session?.currentStatus).toBe('🔎 Checking the reported values...');
  });

  it('processing indicator stops and status message is deleted', async () => {
    vi.spyOn(telegramBot, 'sendMessageWithId').mockResolvedValue(77777);
    const deleteMessageSpy = vi.spyOn(telegramBot, 'deleteMessage').mockResolvedValue(true);

    await indicator.startProcessing(testChatId, 'prescription');
    expect(indicator.isProcessing(testChatId)).toBe(true);

    const stopped = await indicator.stopProcessing(testChatId);

    expect(stopped).toBe(true);
    expect(deleteMessageSpy).toHaveBeenCalledWith(testChatId, 77777);
    expect(indicator.isProcessing(testChatId)).toBe(false);
    expect(indicator.getSession(testChatId)).toBeUndefined();
  });

  it('errors still clean up the indicator and delete status message', async () => {
    vi.spyOn(telegramBot, 'sendMessageWithId').mockResolvedValue(88888);
    const deleteMessageSpy = vi.spyOn(telegramBot, 'deleteMessage').mockResolvedValue(true);

    await expect(
      indicator.withProcessing(testChatId, 'health_question', async () => {
        throw new Error('Simulation of unexpected AI error');
      })
    ).rejects.toThrow('Simulation of unexpected AI error');

    expect(deleteMessageSpy).toHaveBeenCalledWith(testChatId, 88888);
    expect(indicator.isProcessing(testChatId)).toBe(false);
  });

  it('periodic typing refresher fires periodically until stopped', async () => {
    vi.useFakeTimers();
    const sendChatActionSpy = vi.spyOn(telegramBot, 'sendChatAction').mockResolvedValue(true);
    vi.spyOn(telegramBot, 'sendMessageWithId').mockResolvedValue(11111);

    await indicator.startProcessing(testChatId, 'health_question');
    expect(sendChatActionSpy).toHaveBeenCalledTimes(1);

    // Fast-forward 4 seconds
    vi.advanceTimersByTime(4000);
    expect(sendChatActionSpy).toHaveBeenCalledTimes(2);

    // Fast-forward another 4 seconds
    vi.advanceTimersByTime(4000);
    expect(sendChatActionSpy).toHaveBeenCalledTimes(3);

    // Stop processing
    await indicator.stopProcessing(testChatId);

    // Advancing timers further should NOT trigger sendChatAction
    vi.advanceTimersByTime(8000);
    expect(sendChatActionSpy).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  describe('Internal Reasoning and Token Protection (No Chain-of-Thought Exposure)', () => {
    it('strips <thought>...</thought> tags and internal reasoning', () => {
      const rawResponse = `<thought>
The user is asking about fever.
Let's consider differential diagnosis: malaria, dengue, viral.
Rule out red flags.
</thought>
A mild fever can be caused by common viral infections. Please stay hydrated and rest.`;

      const result = ResponseGuard.guard(rawResponse);

      expect(result.content).not.toContain('<thought>');
      expect(result.content).not.toContain('malaria, dengue');
      expect(result.content).toContain('A mild fever can be caused by common viral infections');
      expect(result.violations).toContain('INTERNAL_CHAIN_OF_THOUGHT_STRIPPED');
    });

    it('strips <think>...</think> tags used by reasoning models', () => {
      const rawResponse = `<think>
Analyzing lab values: Hb 10.2 is low, indicates mild anemia.
Format response with empathetic tone.
</think>
Your hemoglobin level of 10.2 g/dL is slightly below typical reference ranges, which may indicate mild anemia.`;

      const result = ResponseGuard.guard(rawResponse);

      expect(result.content).not.toContain('<think>');
      expect(result.content).not.toContain('Format response with empathetic tone');
      expect(result.content).toContain('Your hemoglobin level of 10.2 g/dL');
      expect(result.violations).toContain('INTERNAL_CHAIN_OF_THOUGHT_STRIPPED');
    });

    it('strips markdown ```thought blocks and [Internal Reasoning] brackets', () => {
      const rawResponse = `\`\`\`thought
Analyzing drug interactions between Paracetamol and Ibuprofen.
Check maximum daily dose.
\`\`\`
[Internal Reasoning: Ensure patient is warned about hepatic safety]
Paracetamol and Ibuprofen can sometimes be taken together under medical direction, but observe daily limits.`;

      const result = ResponseGuard.guard(rawResponse);

      expect(result.content).not.toContain('```thought');
      expect(result.content).not.toContain('hepatic safety');
      expect(result.content).toContain('Paracetamol and Ibuprofen');
      expect(result.violations).toContain('INTERNAL_THOUGHT_BLOCK_STRIPPED');
      expect(result.violations).toContain('INTERNAL_REASONING_BRACKET_STRIPPED');
    });

    it('strips internal provider keys, error traces, and system instruction leaks', () => {
      const rawResponse = `GEMINI_API_KEY=AIzaSyFakeSecretKey123
System instructions: You are Jeeva AI, a medical bot.
Provider internal error: connection reset by peer
Here is the medical guidance you requested regarding dietary fiber.`;

      const result = ResponseGuard.guard(rawResponse);

      expect(result.content).not.toContain('AIzaSyFakeSecretKey123');
      expect(result.content).not.toContain('System instructions:');
      expect(result.content).not.toContain('connection reset');
      expect(result.content).toContain('Here is the medical guidance you requested regarding dietary fiber.');
      expect(result.violations).toContain('INTERNAL_API_LEAK_STRIPPED');
    });
  });
});
