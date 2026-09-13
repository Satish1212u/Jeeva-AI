import {
  AIProvider,
  AIProviderError,
  AIRequest,
  AIRequestType,
  AIResponse
} from './providers/types.js';
import { geminiFlashProvider } from './providers/geminiFlash.js';
import { geminiFlashLiteProvider } from './providers/geminiFlashLite.js';
import { grokProvider } from './providers/grok.js';
import { openRouterProvider } from './providers/openrouter.js';
import { providerHealth } from './providerHealth.js';
import { ResponseGuard, GuardResult } from './responseGuard.js';
import { SupportedLanguage } from '../utils/language.js';
import { logger } from '../utils/logger.js';

export interface AIRouteExecutionResult {
  response: AIResponse;
  guardResult: GuardResult;
  providerUsed: string;
  fallbackUsed: boolean;
  retriesAttempted: number;
}

export class AIRouter {
  private primaryMedical: AIProvider;
  private primaryFast: AIProvider;
  private secondaryFallback: AIProvider;
  private tertiaryFallback: AIProvider;

  constructor(options?: {
    primaryMedical?: AIProvider;
    primaryFast?: AIProvider;
    secondaryFallback?: AIProvider;
    tertiaryFallback?: AIProvider;
  }) {
    this.primaryMedical = options?.primaryMedical || geminiFlashProvider;
    this.primaryFast = options?.primaryFast || geminiFlashLiteProvider;
    this.secondaryFallback = options?.secondaryFallback || grokProvider;
    this.tertiaryFallback = options?.tertiaryFallback || openRouterProvider;
  }

  /**
   * Automatically classify request type based on images, keywords, and context
   */
  public determineRequestType(prompt: string, hasImages: boolean = false): AIRequestType {
    if (hasImages) {
      return 'image_request';
    }

    const lower = prompt.toLowerCase();

    // Simple greetings and light conversational questions
    const greetingPatterns = [
      /^(hi|hello|hey|namaste|good (morning|evening|afternoon)|hola)\b/i,
      /^(how are you|kaise ho|who are you|what is medai|what is jeeva ai|help)\b/i,
      /^(ok|thanks|thank you|shukriya|theek hai)\b/i
    ];

    if (greetingPatterns.some((p) => p.test(lower.trim())) && lower.length < 40) {
      return 'simple_request';
    }

    // Lab reports, blood tests, clinical symptoms, medicines
    const medicalKeywords = [
      'pain', 'dard', 'fever', 'bukhar', 'cough', 'khansi', 'sugar', 'blood',
      'hb', 'hemoglobin', 'creatinine', 'tablet', 'mg', 'capsule', 'doctor',
      'infection', 'allergy', 'rash', 'swelling', 'ultrasound', 'cbc', 'kft',
      'lft', 'tsh', 'pressure', 'bp', 'vomit', 'diarrhea', 'nausea', 'headache'
    ];

    if (medicalKeywords.some((k) => lower.includes(k))) {
      return 'medical_request';
    }

    // Default to medical_request if length > 40 characters for careful health handling
    return lower.length > 40 ? 'medical_request' : 'simple_request';
  }

  /**
   * Executes request with priority routing, bounded retries, and fallback cascade.
   */
  public async execute(
    request: AIRequest,
    lang: SupportedLanguage = 'en'
  ): Promise<AIRouteExecutionResult> {
    const startTime = Date.now();
    const requestType = request.requestType || this.determineRequestType(request.prompt, !!(request.images && request.images.length > 0));
    request.requestType = requestType;

    // 1. Determine primary provider by request type
    const primaryProvider =
      requestType === 'simple_request' ? this.primaryFast : this.primaryMedical;

    const fallbackCascade = [
      primaryProvider,
      this.secondaryFallback,
      this.tertiaryFallback
    ];

    let lastError: AIProviderError | null = null;
    let fallbackUsed = false;
    let retriesAttempted = 0;

    for (let i = 0; i < fallbackCascade.length; i++) {
      const currentProvider = fallbackCascade[i];
      fallbackUsed = i > 0;

      // Check if provider is available
      const isAvail = await currentProvider.isAvailable();
      if (!isAvail) {
        logger.info(
          { provider: currentProvider.name, request_type: requestType, reason: 'NOT_AVAILABLE' },
          'Provider is not available; moving to next provider in cascade.'
        );
        continue;
      }

      // Try calling current provider with bounded retry (max 1 retry for primary on transient errors)
      const maxProviderAttempts = i === 0 ? 2 : 1;

      for (let attempt = 1; attempt <= maxProviderAttempts; attempt++) {
        try {
          const isVision =
            (requestType === 'image_request' || requestType === 'document_request') &&
            !!currentProvider.generateVision;

          let response = isVision
            ? await currentProvider.generateVision!(request)
            : await currentProvider.generateText(request);

          // If provider returned empty content, whitespace-only, or invalid response:
          // treat it as provider failure and continue fallback cascade
          if (!response || typeof response.content !== 'string' || !response.content.trim()) {
            throw new Error(`Provider ${currentProvider.name} returned an empty or invalid response.`);
          }

          // Validate language match
          const isLangMatch = ResponseGuard.validateLanguageMatch(response.content, lang);
          if (!isLangMatch) {
            logger.warn(
              { provider: currentProvider.name, expectedLang: lang },
              'Response language mismatch detected. Retrying once with explicit language instruction.'
            );

            // Retry once with explicit language reinforcement instruction
            const langName =
              lang === 'hi' ? 'Hindi (Devanagari script)' : lang === 'hinglish' ? 'Hinglish (Roman Hindi)' : 'English';
            const reinforcedPrompt = `${request.prompt}\n\n[CRITICAL INSTRUCTION: You MUST respond ENTIRELY in ${langName}]`;

            const retryRequest: AIRequest = {
              ...request,
              prompt: reinforcedPrompt
            };

            const retryResponse = isVision
              ? await currentProvider.generateVision!(retryRequest)
              : await currentProvider.generateText(retryRequest);

            if (
              retryResponse &&
              typeof retryResponse.content === 'string' &&
              retryResponse.content.trim() &&
              ResponseGuard.validateLanguageMatch(retryResponse.content, lang)
            ) {
              response = retryResponse;
            } else {
              throw new Error(
                `Provider ${currentProvider.name} response language did not match expected language ${lang}.`
              );
            }
          }

          const latencyMs = Date.now() - startTime;

          // Record provider success
          providerHealth.recordSuccess(currentProvider.name, latencyMs);

          // Log ONLY safe metadata
          logger.info(
            {
              provider: currentProvider.name,
              request_type: requestType,
              latency_ms: latencyMs,
              status: 'success',
              fallback_used: fallbackUsed,
              retries_attempted: retriesAttempted
            },
            'AI provider request completed successfully.'
          );

          // Run through ResponseGuard
          const guardResult = ResponseGuard.guard(response.content, lang);

          return {
            response,
            guardResult,
            providerUsed: currentProvider.name,
            fallbackUsed,
            retriesAttempted
          };
        } catch (err: any) {
          const providerErr = this.ensureProviderError(err, currentProvider.name);
          lastError = providerErr;

          providerHealth.recordFailure(currentProvider.name, providerErr);

          const errorCategory = providerErr.isAuthError
            ? 'AUTH_ERROR'
            : providerErr.isRateLimit
            ? 'RATE_LIMIT'
            : providerErr.isTransient
            ? 'TRANSIENT'
            : 'CLIENT_ERROR';

          logger.warn(
            {
              provider: currentProvider.name,
              request_type: requestType,
              status: 'failure',
              fallback_used: fallbackUsed,
              error_category: errorCategory,
              attempt,
              max_attempts: maxProviderAttempts
            },
            'AI provider call failed.'
          );

          // If auth error or permanent client error, never retry same provider
          if (providerErr.isAuthError || !providerErr.isTransient) {
            break;
          }

          // If transient error and have retry left on primary
          if (providerErr.isTransient && attempt < maxProviderAttempts) {
            retriesAttempted++;
            // Exponential backoff
            await new Promise((res) => setTimeout(res, 500 * attempt));
            continue;
          }

          // Move to next provider in fallback cascade
          break;
        }
      }
    }

    // If all providers fail: return structured, safe medical error
    const totalLatencyMs = Date.now() - startTime;
    logger.error(
      {
        status: 'all_providers_failed',
        request_type: requestType,
        total_latency_ms: totalLatencyMs,
        last_error_category: lastError?.isRateLimit ? 'RATE_LIMIT' : 'PROVIDER_FAILURE'
      },
      'All configured AI providers failed.'
    );

    const safeErrorMessage = this.getFallbackErrorMessage(lang);
    const guardedError = ResponseGuard.guard(safeErrorMessage, lang);

    return {
      response: {
        content: safeErrorMessage,
        provider: 'fallback-system',
        model: 'none',
        latencyMs: totalLatencyMs
      },
      guardResult: guardedError,
      providerUsed: 'fallback-system',
      fallbackUsed: true,
      retriesAttempted
    };
  }

  private ensureProviderError(err: any, providerName: string): AIProviderError {
    if (err && typeof err === 'object' && 'isTransient' in err && 'isRateLimit' in err) {
      return err as AIProviderError;
    }

    const message = err?.message || String(err);
    const status = err?.status || err?.statusCode || 500;

    return {
      provider: providerName,
      isTransient: status >= 500 || /timeout|econnreset|empty or invalid/i.test(message),
      isRateLimit: status === 429 || /rate limit|quota/i.test(message),
      isAuthError: status === 401 || status === 403 || /unauthorized|api key/i.test(message),
      statusCode: status,
      message,
      originalError: err
    };
  }

  private getFallbackErrorMessage(lang: SupportedLanguage): string {
    if (lang === 'hi') {
      return `⚠️ Jeeva AI सेवाएँ वर्तमान में अत्यधिक लोड या प्रदाता समस्या का सामना कर रही हैं।\n\nकृपया कुछ क्षण बाद पुनः प्रयास करें। यदि आपको कोई गंभीर लक्षण है, तो कृपया तुरंत किसी योग्य डॉक्टर से संपर्क करें या आपातकालीन 112 डायल करें।`;
    }
    if (lang === 'hinglish') {
      return `⚠️ Jeeva AI servers abhi high traffic face kar rahe hain.\n\nKripya thodi der baad dobara try karein. Agar aapko severe symptoms hain to turant doctor se consult karein ya 112 par call karein.`;
    }
    return `⚠️ Jeeva AI is currently experiencing high demand or temporary connectivity limitations across all AI providers.\n\nPlease try your query again in a moment. For any urgent health concerns, please consult a medical practitioner or contact emergency services immediately.`;
  }
}

export const aiRouter = new AIRouter();
