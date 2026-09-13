import { detectLanguage, SupportedLanguage } from '../utils/language.js';
import { SafetyEngine } from './safetyEngine.js';

export type UserIntent =
  | 'EMERGENCY'
  | 'COMMAND'
  | 'MEDICINE_LOOKUP'
  | 'REPORT_ANALYSIS'
  | 'PRESCRIPTION_QUERY'
  | 'SYMPTOM_QUERY'
  | 'DOCTOR_SUMMARY'
  | 'GENERAL_HEALTH';

export interface RouteDecision {
  intent: UserIntent;
  language: SupportedLanguage;
  extractedQuery?: string;
  isEmergency: boolean;
  emergencyResponse?: string;
}

export class IntentRouter {
  public static route(text: string, preferredLanguage?: SupportedLanguage): RouteDecision {
    const language = preferredLanguage || detectLanguage(text);

    // 1. Check for emergency first
    const safety = SafetyEngine.evaluateInput(text, language);
    if (safety.isEmergency) {
      return {
        intent: 'EMERGENCY',
        language,
        isEmergency: true,
        emergencyResponse: safety.emergencyResponse
      };
    }

    const trimmed = text.trim();

    // 2. Commands
    if (trimmed.startsWith('/')) {
      return {
        intent: 'COMMAND',
        language,
        extractedQuery: trimmed,
        isEmergency: false
      };
    }

    const lower = trimmed.toLowerCase();

    // 3. Doctor summary
    if (lower.includes('doctor summary') || lower.includes('summary ready') || lower.includes('summary banao')) {
      return {
        intent: 'DOCTOR_SUMMARY',
        language,
        extractedQuery: trimmed,
        isEmergency: false
      };
    }

    // 4. Medicine lookup
    const medicineKeywords = ['medicine', 'tablet', 'syrup', 'capsule', 'dosage', 'dawa', 'goli', 'side effect', 'paracetamol', 'metformin', 'azithromycin'];
    if (medicineKeywords.some((kw) => lower.includes(kw))) {
      return {
        intent: 'MEDICINE_LOOKUP',
        language,
        extractedQuery: trimmed,
        isEmergency: false
      };
    }

    // 5. Report analysis
    const reportKeywords = ['report', 'lab test', 'cbc', 'kft', 'lft', 'blood test', 'hb', 'creatinine', 'sugar', 'cholesterol'];
    if (reportKeywords.some((kw) => lower.includes(kw))) {
      return {
        intent: 'REPORT_ANALYSIS',
        language,
        extractedQuery: trimmed,
        isEmergency: false
      };
    }

    // 6. Symptom query
    const symptomKeywords = ['pain', 'dard', 'fever', 'bukhar', 'cough', 'khansi', 'vomit', 'swelling', 'rash', 'dizziness', 'kamzori'];
    if (symptomKeywords.some((kw) => lower.includes(kw))) {
      return {
        intent: 'SYMPTOM_QUERY',
        language,
        extractedQuery: trimmed,
        isEmergency: false
      };
    }

    return {
      intent: 'GENERAL_HEALTH',
      language,
      extractedQuery: trimmed,
      isEmergency: false
    };
  }
}
