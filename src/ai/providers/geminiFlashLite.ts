import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  AIProvider,
  AIProviderError,
  AIRequest,
  AIResponse
} from './types.js';

export class GeminiFlashLiteProvider implements AIProvider {
  public readonly name = 'gemini-flash-lite';
  public readonly defaultModel: string;
  private client: GoogleGenAI | null = null;

  constructor(modelName?: string) {
    this.defaultModel = modelName || env.GEMINI_FAST_MODEL || 'gemini-2.5-flash-lite';
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0) {
      this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
  }

  public async isAvailable(): Promise<boolean> {
    return !!this.client || env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
  }

  public async generateText(input: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const timeoutMs = input.timeoutMs || env.AI_REQUEST_TIMEOUT_MS || 30000;

    // Simulated fallback response for test / key-less dev environment
    if (!this.client) {
      logger.info(
        { provider: this.name, model: this.defaultModel, requestType: input.requestType },
        'Gemini Flash-Lite API key not supplied; executing simulated response.'
      );
      return {
        content: this.generateSimulatedResponse(input),
        provider: this.name,
        model: this.defaultModel,
        tokensUsed: { promptTokens: 15, completionTokens: 40, totalTokens: 55 },
        latencyMs: Date.now() - startTime
      };
    }

    try {
      const contents = this.buildContents(input);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutErr: AIProviderError = {
            provider: this.name,
            isTransient: true,
            isRateLimit: false,
            isAuthError: false,
            statusCode: 408,
            message: `Gemini Flash-Lite timed out after ${timeoutMs}ms`
          };
          reject(timeoutErr);
        }, timeoutMs);
      });

      const callPromise = this.client.models.generateContent({
        model: this.defaultModel,
        contents,
        config: {
          systemInstruction: input.systemInstruction,
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxTokens ?? 1000
        }
      });

      const response = await Promise.race([callPromise, timeoutPromise]);
      const latencyMs = Date.now() - startTime;
      const text = response.text || '';

      return {
        content: text,
        provider: this.name,
        model: this.defaultModel,
        tokensUsed: {
          promptTokens: response.usageMetadata?.promptTokenCount,
          completionTokens: response.usageMetadata?.candidatesTokenCount,
          totalTokens: response.usageMetadata?.totalTokenCount
        },
        latencyMs
      };
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  private buildContents(input: AIRequest): any[] {
    const contents: any[] = [];

    if (input.history && input.history.length > 0) {
      for (const msg of input.history) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    contents.push({
      role: 'user',
      parts: [{ text: input.prompt }]
    });

    return contents;
  }

  private normalizeError(error: any): AIProviderError {
    if (error && error.provider === this.name) {
      return error as AIProviderError;
    }

    const message = error?.message || String(error);
    const status = error?.status || error?.statusCode || 500;

    const isRateLimit =
      status === 429 ||
      /resource_exhausted|rate limit|quota/i.test(message);

    const isAuthError =
      status === 401 ||
      status === 403 ||
      /api key not valid|unauthorized|forbidden|api_key_invalid/i.test(message);

    const isTransient =
      isRateLimit ||
      status >= 500 ||
      status === 408 ||
      /econnreset|etimedout|unavailable|deadline_exceeded/i.test(message);

    return {
      provider: this.name,
      isTransient,
      isRateLimit,
      isAuthError,
      statusCode: status,
      message: `Gemini Flash-Lite error: ${message}`,
      originalError: error
    };
  }

  private generateSimulatedResponse(input: AIRequest): string {
    const clean = input.prompt.toLowerCase();
    if (clean.includes('namaste') || clean.includes('hello') || clean.includes('hi')) {
      return 'Namaste! How can MedAI assist you with your health questions today?';
    }
    return `Thank you for reaching out. Based on your inquiry "${input.prompt}", please ensure you monitor your symptoms and consult a certified healthcare professional for detailed medical evaluation.`;
  }
}

export const geminiFlashLiteProvider = new GeminiFlashLiteProvider();
