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

    // Run core SafetyEngine post-processing
    const processed = SafetyEngine.postProcessResponse(rawOutput, lang);

    let sanitized = processed.sanitizedText;
    const violations = [...processed.warnings];

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
