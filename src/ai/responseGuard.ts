import { SafetyEngine } from './safetyEngine.js';
import { SupportedLanguage } from '../utils/language.js';
import { logger } from '../utils/logger.js';

export interface GuardResult {
  content: string;
  isSanitized: boolean;
  violations: string[];
}

export class ResponseGuard {
  /**
   * Lightweight heuristic to validate that response language broadly matches the expected language.
   */
  public static validateLanguageMatch(content: string, expectedLang: SupportedLanguage): boolean {
    if (!content || typeof content !== 'string') return false;
    const trimmed = content.trim();
    if (!trimmed) return false;

    // Count Devanagari characters and Latin characters
    const devanagariChars = (trimmed.match(/[\u0900-\u097F]/g) || []).length;
    const latinChars = (trimmed.match(/[a-zA-Z]/g) || []).length;

    if (expectedLang === 'hi') {
      // Expected Hindi: Response should primarily use Devanagari
      if (trimmed.length > 20) {
        return devanagariChars >= 10 || devanagariChars > latinChars * 0.2;
      }
      return devanagariChars > 0;
    }

    if (expectedLang === 'hinglish') {
      // Expected Hinglish: Response should primarily use Roman script, NOT full Devanagari
      if (devanagariChars > 15 && devanagariChars > latinChars * 0.2) {
        return false;
      }
      return latinChars > 0;
    }

    if (expectedLang === 'en') {
      // Expected English: Response should primarily be English in Roman script, NO Devanagari
      if (devanagariChars > 15 && devanagariChars > latinChars * 0.2) {
        return false;
      }
      return latinChars > 0;
    }

    return true;
  }

  /**
   * Sanitizes and validates AI provider output before it can reach the Telegram user.
   */
  public static guard(rawOutput: string, lang: SupportedLanguage = 'en'): GuardResult {
    if (!rawOutput || typeof rawOutput !== 'string') {
      return {
        content: 'MedAI was unable to generate a safe response. Please consult a healthcare professional.',
        isSanitized: true,
        violations: ['EMPTY_OR_INVALID_OUTPUT']
      };
    }

    // Filter out internal chain-of-thought, token reasoning, and private prompt artifacts
    let sanitized = rawOutput;
    const violations: string[] = [];

    // Strip <thought>...</thought>, <think>...</think>, <reasoning>...</reasoning>
    const thoughtTagRegex = /<(?:thought|think|reasoning)>[\s\S]*?<\/(?:thought|think|reasoning)>/gi;
    if (thoughtTagRegex.test(sanitized)) {
      sanitized = sanitized.replace(thoughtTagRegex, '').trim();
      violations.push('INTERNAL_CHAIN_OF_THOUGHT_STRIPPED');
    }

    // Strip ```thought ... ``` or ```thinking ... ``` blocks
    const thoughtBlockRegex = /```(?:thought|thinking|reasoning)[\s\S]*?```/gi;
    if (thoughtBlockRegex.test(sanitized)) {
      sanitized = sanitized.replace(thoughtBlockRegex, '').trim();
      violations.push('INTERNAL_THOUGHT_BLOCK_STRIPPED');
    }

    // Strip [Internal Reasoning: ...] or [Chain of Thought: ...]
    const bracketReasoningRegex = /\[(?:internal reasoning|chain of thought|model thought|reasoning):[\s\S]*?\]/gi;
    if (bracketReasoningRegex.test(sanitized)) {
      sanitized = sanitized.replace(bracketReasoningRegex, '').trim();
      violations.push('INTERNAL_REASONING_BRACKET_STRIPPED');
    }

    // Strip API keys, environment secrets, and raw internal provider error traces
    const leakRegex = /(?:GEMINI_API_KEY|GROK_API_KEY|OPENROUTER_API_KEY|TELEGRAM_BOT_TOKEN|System instructions:|Provider internal error:|AxiosError:|GoogleGenerativeAIError:)[^\n]*/gi;
    if (leakRegex.test(sanitized)) {
      sanitized = sanitized.replace(leakRegex, '').trim();
      violations.push('INTERNAL_API_LEAK_STRIPPED');
    }

    if (!sanitized) {
      sanitized = 'I have processed your medical question. Please let me know how I can further assist you.';
    }

    // Run core SafetyEngine post-processing
    const processed = SafetyEngine.postProcessResponse(sanitized, lang);

    sanitized = processed.sanitizedText;
    violations.push(...processed.warnings);

    // Additional specific guardrail: fake clinical confirmation of imaging
    const imagingConfirmationRegex = /\b(this image confirms|the x-ray definitively shows|radiology proves|mri diagnostic)\b/gi;
    if (imagingConfirmationRegex.test(sanitized)) {
      sanitized = sanitized.replace(
        imagingConfirmationRegex,
        'This image suggests possible features that require radiologist review'
      );
      violations.push('CLINICAL_IMAGING_CERTAINTY_SOFTENED');
    }

    // Additional specific guardrail: fabricated sources or guarantee assertions
    const guaranteeRegex = /\b(100% cure|guaranteed recovery|miracle cure|definitely cured)\b/gi;
    if (guaranteeRegex.test(sanitized)) {
      sanitized = sanitized.replace(guaranteeRegex, 'clinical management under physician guidance');
      violations.push('MIRACLE_CURE_CLAIM_REMOVED');
    }

    if (violations.length > 0) {
      logger.info(
        { violations, count: violations.length },
        'ResponseGuard sanitized raw AI provider output.'
      );
    }

    return {
      content: sanitized,
      isSanitized: violations.length > 0,
      violations
    };
  }
}
