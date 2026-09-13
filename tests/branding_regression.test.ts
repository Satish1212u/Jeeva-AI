import { describe, it, expect, vi } from 'vitest';
import { CommandHandler } from '../src/bot/handlers/commandHandler.js';
import { telegramBot } from '../src/bot/telegramBot.js';
import { DISCLAIMERS, EMERGENCY_MESSAGES } from '../src/utils/language.js';
import { STATUS_PRESETS } from '../src/bot/processingIndicator.js';
import { DoctorSummaryService } from '../src/medical/summaries/doctorSummaryService.js';
import { buildSystemPrompt } from '../src/ai/prompts/systemPrompts.js';
import { aiRouter } from '../src/ai/aiRouter.js';
import { ResponseGuard } from '../src/ai/responseGuard.js';
import { getLocalizedErrorMessage } from '../src/bot/handlers/messageHandler.js';
import { UserService } from '../src/users/userService.js';

describe('Branding Consistency & Regression Guard (Jeeva AI)', () => {
  const dummyChatId = 12345678;

  it('1. /start welcome message contains "Jeeva AI" and NO "MedAI"', async () => {
    vi.spyOn(UserService, 'getOrCreateUser').mockResolvedValueOnce({ id: 'u1' } as any);
    vi.spyOn(UserService, 'recordConsent').mockResolvedValueOnce({} as any);

    let sentText = '';
    vi.spyOn(telegramBot, 'sendMessage').mockImplementationOnce(async (payload) => {
      sentText = payload.text;
      return true;
    });

    await CommandHandler.handleStart(dummyChatId, { id: dummyChatId, firstName: 'Test' });

    expect(sentText).toContain('Welcome to **Jeeva AI** 🩺');
    expect(sentText).toContain('⚠️ **Jeeva AI is an AI health assistant');
    expect(sentText).not.toContain('MedAI');
    expect(sentText).not.toContain('medai');
  });

  it('2. /help guide contains "Jeeva AI" and NO "MedAI"', async () => {
    let sentText = '';
    vi.spyOn(telegramBot, 'sendMessage').mockImplementationOnce(async (payload) => {
      sentText = payload.text;
      return true;
    });

    await CommandHandler.handleHelp(dummyChatId);

    expect(sentText).toContain('Jeeva AI');
    expect(sentText).not.toContain('MedAI');
  });

  it('3. /privacy policy contains "Jeeva AI" and NO "MedAI"', async () => {
    let sentText = '';
    vi.spyOn(telegramBot, 'sendMessage').mockImplementationOnce(async (payload) => {
      sentText = payload.text;
      return true;
    });

    await CommandHandler.handlePrivacy(dummyChatId);

    expect(sentText).toContain('Jeeva AI');
    expect(sentText).not.toContain('MedAI');
  });

  it('4. /reset data wipe confirmation contains "Jeeva AI" and NO "MedAI"', async () => {
    vi.spyOn(UserService, 'deleteUserData').mockResolvedValueOnce(true);

    let sentText = '';
    vi.spyOn(telegramBot, 'sendMessage').mockImplementationOnce(async (payload) => {
      sentText = payload.text;
      return true;
    });

    await CommandHandler.handleReset(dummyChatId, dummyChatId);

    expect(sentText).toContain('Jeeva AI');
    expect(sentText).not.toContain('MedAI');
  });

  it('5. /compare instructions contains "Jeeva AI" and NO "MedAI"', async () => {
    let sentText = '';
    vi.spyOn(telegramBot, 'sendMessage').mockImplementationOnce(async (payload) => {
      sentText = payload.text;
      return true;
    });

    await CommandHandler.handleCompare(dummyChatId);

    expect(sentText).toContain('Jeeva AI');
    expect(sentText).not.toContain('MedAI');
  });

  it('6. All language disclaimers use "Jeeva AI" and contain NO "MedAI"', () => {
    for (const [lang, text] of Object.entries(DISCLAIMERS)) {
      expect(text, `Disclaimer for ${lang} should contain Jeeva AI`).toContain('Jeeva AI');
      expect(text, `Disclaimer for ${lang} should not contain MedAI`).not.toContain('MedAI');
    }
  });

  it('7. Emergency messages contain NO "MedAI"', () => {
    for (const [lang, text] of Object.entries(EMERGENCY_MESSAGES)) {
      expect(text, `Emergency message for ${lang} should not contain MedAI`).not.toContain('MedAI');
    }
  });

  it('8. Processing indicator presets use "Jeeva AI" and contain NO "MedAI"', () => {
    for (const [type, presets] of Object.entries(STATUS_PRESETS)) {
      for (const preset of presets) {
        if (preset.includes('thinking') || preset.includes('processing')) {
          expect(preset, `Preset ${type} should reference Jeeva AI`).toContain('Jeeva AI');
        }
        expect(preset, `Preset ${type} should not contain MedAI`).not.toContain('MedAI');
      }
    }
  });

  it('9. Doctor consultation briefing header uses "JEEVA AI" and NO "MEDAI"', () => {
    const summary = DoctorSummaryService.generateSummary({
      patientName: 'Priya Sharma',
      relationship: 'Self',
      mainConcerns: ['Headache'],
      recentSymptoms: ['Throbbing pain'],
      relevantMedicalHistory: [],
      currentMedications: [],
      recentAbnormalLabValues: [],
      importantReports: [],
      suggestedQuestionsToDiscuss: []
    });

    expect(summary).toContain('JEEVA AI CLINICAL VISIT BRIEFING');
    expect(summary).not.toContain('MEDAI');
  });

  it('10. System prompt instructs persona as "Jeeva AI"', () => {
    const prompt = buildSystemPrompt('en');
    expect(prompt).toContain('You are Jeeva AI');
    expect(prompt).not.toContain('You are MedAI');
  });

  it('11. AIRouter fallback error message uses "Jeeva AI" across all languages', () => {
    const enFallback = (aiRouter as any).getFallbackErrorMessage('en');
    const hiFallback = (aiRouter as any).getFallbackErrorMessage('hi');
    const hinglishFallback = (aiRouter as any).getFallbackErrorMessage('hinglish');

    expect(enFallback).toContain('Jeeva AI');
    expect(enFallback).not.toContain('MedAI');

    expect(hiFallback).toContain('Jeeva AI');
    expect(hiFallback).not.toContain('MedAI');

    expect(hinglishFallback).toContain('Jeeva AI');
    expect(hinglishFallback).not.toContain('MedAI');
  });

  it('12. ResponseGuard empty output uses "Jeeva AI"', () => {
    const guarded = ResponseGuard.guard('');
    expect(guarded.content).toContain('Jeeva AI');
    expect(guarded.content).not.toContain('MedAI');
  });

  it('13. Localized error messages use "Jeeva AI"', () => {
    expect(getLocalizedErrorMessage('en')).toContain('Jeeva AI');
    expect(getLocalizedErrorMessage('hi')).toContain('Jeeva AI');
    expect(getLocalizedErrorMessage('hinglish')).toContain('Jeeva AI');

    expect(getLocalizedErrorMessage('en')).not.toContain('MedAI');
    expect(getLocalizedErrorMessage('hi')).not.toContain('MedAI');
    expect(getLocalizedErrorMessage('hinglish')).not.toContain('MedAI');
  });
});
