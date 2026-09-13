import { describe, it, expect, beforeEach } from 'vitest';
import {
  AIRouter,
  ResponseGuard,
  providerHealth,
  AIProvider,
  AIProviderError
} from '../src/ai/index.js';

describe('AI Provider Layer & AIRouter', () => {
  beforeEach(() => {
    providerHealth.resetHealth();
  });

  describe('Provider Health Tracker', () => {
    it('should initialize with HEALTHY status for all providers', () => {
      const status = providerHealth.getHealthStatus();
      expect(status['gemini-flash']).toBeDefined();
      expect(status['gemini-flash'].status).toBe('HEALTHY');
      expect(status['gemini-flash-lite'].status).toBe('HEALTHY');
      expect(status['grok'].status).toBe('HEALTHY');
      expect(status['openrouter'].status).toBe('HEALTHY');
    });

    it('should update status to DEGRADED and UNAVAILABLE upon consecutive failures', () => {
      const dummyError: AIProviderError = {
        provider: 'gemini-flash',
        isTransient: true,
        isRateLimit: false,
        isAuthError: false,
        statusCode: 503,
        message: 'Service unavailable'
      };

      providerHealth.recordFailure('gemini-flash', dummyError);
      expect(providerHealth.getHealthStatus()['gemini-flash'].status).toBe('HEALTHY');

      providerHealth.recordFailure('gemini-flash', dummyError);
      expect(providerHealth.getHealthStatus()['gemini-flash'].status).toBe('DEGRADED');

      const authError: AIProviderError = {
        provider: 'gemini-flash',
        isTransient: false,
        isRateLimit: false,
        isAuthError: true,
        statusCode: 401,
        message: 'Invalid key'
      };
      providerHealth.recordFailure('gemini-flash', authError);
      expect(providerHealth.getHealthStatus()['gemini-flash'].status).toBe('UNAVAILABLE');
    });

    it('should restore HEALTHY status on success', () => {
      providerHealth.recordSuccess('gemini-flash', 120);
      const status = providerHealth.getHealthStatus()['gemini-flash'];
      expect(status.status).toBe('HEALTHY');
      expect(status.lastLatencyMs).toBe(120);
      expect(status.consecutiveFailures).toBe(0);
    });
  });

  describe('ResponseGuard', () => {
    it('should sanitize doctor impersonation while preserving educational info', () => {
      const raw = 'As your doctor, you should know that fasting blood sugar above 100 mg/dL is slightly elevated.';
      const res = ResponseGuard.guard(raw, 'en');

      expect(res.isSanitized).toBe(true);
      expect(res.content).not.toContain('As your doctor');
      expect(res.content).toContain('As an AI health assistant');
      expect(res.content).toContain('fasting blood sugar above 100');
      expect(res.content).toContain('Jeeva AI is an AI health assistant');
    });

    it('should soften definitive clinical imaging diagnostic certainty', () => {
      const raw = 'The X-ray definitively shows pulmonary consolidation in the lower right lobe.';
      const res = ResponseGuard.guard(raw, 'en');

      expect(res.isSanitized).toBe(true);
      expect(res.content).not.toContain('definitively shows');
      expect(res.content).toContain('suggests possible features that require radiologist review');
    });

    it('should remove miracle cure or guarantee claims', () => {
      const raw = 'This herbal tonic provides a 100% cure for diabetes.';
      const res = ResponseGuard.guard(raw, 'en');

      expect(res.isSanitized).toBe(true);
      expect(res.content).not.toContain('100% cure');
    });
  });

  describe('AIRouter Routing & Priority', () => {
    it('should route simple greeting to Gemini Flash-Lite', () => {
      const router = new AIRouter();
      const type = router.determineRequestType('Hello! Good morning');
      expect(type).toBe('simple_request');
    });

    it('should route medical symptoms and lab inquiries to Gemini Flash', () => {
      const router = new AIRouter();
      const type1 = router.determineRequestType('Mera fasting blood sugar 130 mg/dL aaya hai');
      expect(type1).toBe('medical_request');

      const type2 = router.determineRequestType('I have a persistent cough and fever for 3 days');
      expect(type2).toBe('medical_request');
    });

    it('should route image and document inputs to Gemini Flash image_request', () => {
      const router = new AIRouter();
      const type = router.determineRequestType('Please review this document', true);
      expect(type).toBe('image_request');
    });

    it('should successfully execute request through primary provider', async () => {
      const router = new AIRouter();
      const result = await router.execute({
        requestType: 'simple_request',
        prompt: 'Hello MedAI'
      });

      expect(result.providerUsed).toBe('gemini-flash-lite');
      expect(result.fallbackUsed).toBe(false);
      expect(result.guardResult.content).toBeDefined();
    });

    it('should fall back to Grok when Gemini fails', async () => {
      // Create mock failing Gemini and successful Grok
      const failingGemini: AIProvider = {
        name: 'gemini-flash',
        defaultModel: 'gemini-2.5-flash',
        isAvailable: async () => true,
        generateText: async () => {
          throw {
            provider: 'gemini-flash',
            isTransient: false,
            isRateLimit: true,
            isAuthError: false,
            statusCode: 429,
            message: 'Gemini Quota Exceeded'
          };
        }
      };

      const mockGrok: AIProvider = {
        name: 'grok',
        defaultModel: 'grok-4.6',
        isAvailable: async () => true,
        generateText: async (req) => ({
          content: `Grok response for: ${req.prompt}`,
          provider: 'grok',
          model: 'grok-4.6',
          latencyMs: 150
        })
      };

      const mockOpenRouter: AIProvider = {
        name: 'openrouter',
        defaultModel: 'openrouter/free',
        isAvailable: async () => true,
        generateText: async () => ({
          content: 'OpenRouter response',
          provider: 'openrouter',
          model: 'openrouter/free',
          latencyMs: 200
        })
      };

      const router = new AIRouter({
        primaryMedical: failingGemini,
        secondaryFallback: mockGrok,
        tertiaryFallback: mockOpenRouter
      });

      const result = await router.execute({
        requestType: 'medical_request',
        prompt: 'What are typical creatinine levels?'
      });

      expect(result.providerUsed).toBe('grok');
      expect(result.fallbackUsed).toBe(true);
      expect(result.response.content).toContain('Grok response');
    });

    it('should fall back to OpenRouter when both Gemini and Grok fail', async () => {
      const failingGemini: AIProvider = {
        name: 'gemini-flash',
        defaultModel: 'gemini-2.5-flash',
        isAvailable: async () => true,
        generateText: async () => {
          throw new Error('Gemini API connection error');
        }
      };

      const failingGrok: AIProvider = {
        name: 'grok',
        defaultModel: 'grok-4.6',
        isAvailable: async () => true,
        generateText: async () => {
          throw new Error('Grok API connection error');
        }
      };

      const workingOpenRouter: AIProvider = {
        name: 'openrouter',
        defaultModel: 'openrouter/free',
        isAvailable: async () => true,
        generateText: async (req) => ({
          content: `OpenRouter safe advice for: ${req.prompt}`,
          provider: 'openrouter',
          model: 'openrouter/free',
          latencyMs: 220
        })
      };

      const router = new AIRouter({
        primaryMedical: failingGemini,
        secondaryFallback: failingGrok,
        tertiaryFallback: workingOpenRouter
      });

      const result = await router.execute({
        requestType: 'medical_request',
        prompt: 'Explain fasting blood sugar'
      });

      expect(result.providerUsed).toBe('openrouter');
      expect(result.fallbackUsed).toBe(true);
      expect(result.response.content).toContain('OpenRouter safe advice');
    });

    it('should return safe structured medical error when all providers fail', async () => {
      const failingProvider = (name: string): AIProvider => ({
        name,
        defaultModel: 'model',
        isAvailable: async () => true,
        generateText: async () => {
          throw new Error('Total outage');
        }
      });

      const router = new AIRouter({
        primaryMedical: failingProvider('gemini-flash'),
        primaryFast: failingProvider('gemini-flash-lite'),
        secondaryFallback: failingProvider('grok'),
        tertiaryFallback: failingProvider('openrouter')
      });

      const result = await router.execute(
        {
          requestType: 'medical_request',
          prompt: 'I need urgent advice'
        },
        'en'
      );

      expect(result.providerUsed).toBe('fallback-system');
      expect(result.fallbackUsed).toBe(true);
      expect(result.guardResult.content).toContain('Jeeva AI is currently experiencing high demand');
      expect(result.guardResult.content).toContain('consult a medical practitioner');
    });
  });
});
