import { detectLanguage, EMERGENCY_MESSAGES, DISCLAIMERS, SupportedLanguage } from '../utils/language.js';
import { logger } from '../utils/logger.js';

export interface SafetyCheckResult {
  isEmergency: boolean;
  emergencyType?: string;
  emergencyResponse?: string;
  flaggedKeywords?: string[];
  safetyWarnings: string[];
}

export interface PostProcessResult {
  sanitizedText: string;
  hasAlterations: boolean;
  warnings: string[];
}

/**
 * Dedicated Safety Engine for MedAI
 * Separate from LLM prompts to guarantee deterministic protection.
 */
export class SafetyEngine {
  // Red flag emergency pattern definitions
  private static readonly EMERGENCY_PATTERNS: Array<{
    type: string;
    regex: RegExp;
  }> = [
    {
      type: 'CARDIAC',
      regex: /\b(chest pain|crushing pain|radiating to (arm|jaw|back)|heart attack|chhati me(in)? dard|chhati me(in)? jalan aur dard|dil ka daura|seene me(in)? (bahut |tez )?dard)\b|सीने में( भयानक| तेज| बहुत)? दर्द|दिल का दौरा/i
    },
    {
      type: 'RESPIRATORY',
      regex: /\b(severe shortness of breath|can't breathe|cannot breathe|choking|gasping for air|saans nahi aa rahi|dum ghut raha|neela pad raha|blue lips)\b|सांस नहीं आ रही|सांस लेने में तकलीफ|दम घुट/i
    },
    {
      type: 'STROKE_NEURO',
      regex: /\b(face drooping|arm weakness|slurred speech|sudden paralysis|sudden numbness on one side|lakwa|bolne me pareshani|muh tedha)\b|लकवा|चेहरा लटकना|अचानक कमजोरी/i
    },
    {
      type: 'SEVERE_HEADACHE_MENINGEAL',
      regex: /\b(worst headache of my life|thunderclap headache|stiff neck and high fever|sudden severe vision loss)\b|असहनीय सिरदर्द/i
    },
    {
      type: 'HEMORRHAGE',
      regex: /\b(vomiting blood|coughing blood|uncontrolled bleeding|khoon ki ulti|khoon beh raha hai jo ruk nahi raha)\b|खून की उल्टी|खून बहना/i
    },
    {
      type: 'ANAPHYLAXIS',
      regex: /\b(swollen lips and throat|throat closing up|anaphylaxis|allergic reaction can't breathe|gala band ho raha)\b|गला बंद होना/i
    },
    {
      type: 'PSYCHIATRIC_CRISIS',
      regex: /\b(suicide|suicidal|kill myself|want to die|end my life|jaan dena chahta|khudkushi)\b|आत्महत्या|जान देना/i
    },
    {
      type: 'PEDIATRIC_EMERGENCY',
      regex: /\b(baby (unresponsive|lethargic|seizure)|infant high fever stiff neck|bacha behosh)\b|बच्चा बेहोश/i
    }
  ];

  // Patterns for unsafe LLM outputs to detect and sanitize
  private static readonly DEFINITIVE_DIAGNOSIS_PATTERNS: RegExp[] = [
    /\b(you have|you are suffering from|this confirms you have|you definitely have|the diagnosis is)\s*(?:[A-Za-z\s]*?)(cancer|stroke|infarction|diabetes|hepatitis|infection|covid)/gi,
    /\b(aapko (diabetes|cancer|heart attack) ho gaya hai|ye bimari confirm hai)\b/gi
  ];

  private static readonly MEDICATION_CHANGE_PATTERNS: RegExp[] = [
    /\b(increase your (dose|dosage)|decrease your (dose|dosage)|change your dose|take \d+\s*(mg|ml|tablets?))\b/gi,
    /\b(stop taking your|discontinue your|apni dawai band kar do)\b/gi
  ];

  private static readonly DOCTOR_IMPERSONATION_PATTERNS: RegExp[] = [
    /\b(as your doctor|i am your physician|speaking as a doctor|main aapka doctor hoon)\b/gi
  ];

  /**
   * Evaluates user input for immediate emergency red flags before sending to LLM.
   */
  public static evaluateInput(userInput: string, preferredLang?: SupportedLanguage): SafetyCheckResult {
    const detected = detectLanguage(userInput);
    const lang = detected || preferredLang || 'en';
    const flaggedKeywords: string[] = [];
    const safetyWarnings: string[] = [];

    for (const pattern of this.EMERGENCY_PATTERNS) {
      if (pattern.regex.test(userInput)) {
        flaggedKeywords.push(pattern.type);
      }
    }

    if (flaggedKeywords.length > 0) {
      logger.warn({ flaggedKeywords, userInput }, 'Urgent medical red flag detected in user input.');

      // Psychiatric specific emergency text
      if (flaggedKeywords.includes('PSYCHIATRIC_CRISIS')) {
        const crisisMsg =
          lang === 'hi'
            ? '🚨 *आपातकालीन सहायता हेल्पलाइन*\n\nयदि आप या आपका कोई परिचित तनाव में है या स्वयं को नुकसान पहुँचाने का विचार कर रहा है, तो कृपया तुरंत सहायता प्राप्त करें:\n• भारत: किरण हेल्पलाइन (KIRAN) *1800-599-0019* या *112*\n• US: 988 Suicide & Crisis Lifeline\n• आप अकेले नहीं हैं, पेशेवर सहायता उपलब्ध है।'
            : lang === 'hinglish'
            ? '🚨 *URGENT SUPPORT HELPLINE*\n\nAgar aap distress me hain ya self-harm ke thoughts aa rahe hain, please turant help lein:\n• India: KIRAN Mental Health Helpline *1800-599-0019* ya *112*\n• US: 988 Suicide & Crisis Lifeline\n• Aap akele nahi hain, professional help turant available hai.'
            : '🚨 *URGENT CRISIS HELPLINE*\n\nIf you or someone you know is in distress or experiencing thoughts of self-harm, please reach out for immediate support:\n• India: KIRAN Mental Health Helpline *1800-599-0019* or *112*\n• US: 988 Suicide & Crisis Lifeline\n• UK: 111 or 999\n• Please talk to a professional immediately. You are not alone.';

        return {
          isEmergency: true,
          emergencyType: 'PSYCHIATRIC_CRISIS',
          emergencyResponse: crisisMsg,
          flaggedKeywords,
          safetyWarnings: ['PSYCHIATRIC_CRISIS_DETECTED']
        };
      }

      return {
        isEmergency: true,
        emergencyType: flaggedKeywords[0],
        emergencyResponse: EMERGENCY_MESSAGES[lang],
        flaggedKeywords,
        safetyWarnings: ['EMERGENCY_RED_FLAG_TRIGGERED']
      };
    }

    return {
      isEmergency: false,
      safetyWarnings
    };
  }

  /**
   * Post-processes and sanitizes LLM generated response to strictly enforce guardrails.
   */
  public static postProcessResponse(
    llmResponse: string,
    lang: SupportedLanguage = 'en'
  ): PostProcessResult {
    let sanitizedText = llmResponse;
    let hasAlterations = false;
    const warnings: string[] = [];

    // 1. Remove doctor impersonation
    for (const pattern of this.DOCTOR_IMPERSONATION_PATTERNS) {
      if (pattern.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(pattern, 'As an AI health assistant');
        hasAlterations = true;
        warnings.push('DOCTOR_IMPERSONATION_FILTERED');
      }
    }

    // 2. Catch & soften definitive diagnostic claims
    for (const pattern of this.DEFINITIVE_DIAGNOSIS_PATTERNS) {
      if (pattern.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(
          pattern,
          'These symptoms/findings could be associated with, but only a doctor can diagnose,'
        );
        hasAlterations = true;
        warnings.push('DEFINITIVE_DIAGNOSIS_SOFTENED');
      }
    }

    // 3. Prevent altering medication dosage or stopping prescriptions
    for (const pattern of this.MEDICATION_CHANGE_PATTERNS) {
      if (pattern.test(sanitizedText)) {
        sanitizedText = sanitizedText.replace(
          pattern,
          '[Medication dosage decisions or stopping prescriptions must only be made by your prescribing doctor]'
        );
        hasAlterations = true;
        warnings.push('MEDICATION_ALTERATION_BLOCKED');
      }
    }

    // 4. Ensure disclaimer is present
    const disclaimer = DISCLAIMERS[lang] || DISCLAIMERS.en;
    if (!sanitizedText.includes('MedAI is an AI') && !sanitizedText.includes('MedAI एक AI') && !sanitizedText.includes('MedAI ek AI')) {
      sanitizedText += disclaimer;
    }

    return {
      sanitizedText,
      hasAlterations,
      warnings
    };
  }
}
