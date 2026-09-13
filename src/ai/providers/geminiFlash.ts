import { GoogleGenAI } from '@google/genai';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  AIProvider,
  AIProviderError,
  AIRequest,
  AIResponse
} from './types.js';

export class GeminiFlashProvider implements AIProvider {
  public readonly name = 'gemini-flash';
  public readonly defaultModel: string;
  private client: GoogleGenAI | null = null;

  constructor(modelName?: string) {
    this.defaultModel = modelName || env.GEMINI_PRIMARY_MODEL || 'gemini-2.5-flash';
    if (env.GEMINI_API_KEY && env.GEMINI_API_KEY.trim().length > 0) {
      this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
  }

  public async isAvailable(): Promise<boolean> {
    return !!this.client || env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
  }

  public async generateText(input: AIRequest): Promise<AIResponse> {
    return this.executeGeneration(input, false);
  }

  public async generateVision(input: AIRequest): Promise<AIResponse> {
    return this.executeGeneration(input, true);
  }

  private async executeGeneration(input: AIRequest, isVision: boolean): Promise<AIResponse> {
    const startTime = Date.now();
    const timeoutMs = input.timeoutMs || env.AI_REQUEST_TIMEOUT_MS || 30000;

    // Simulated fallback for testing / key-less development
    if (!this.client) {
      logger.info(
        { provider: this.name, model: this.defaultModel, requestType: input.requestType, isVision },
        'Gemini Flash API key not supplied; executing simulated medical response.'
      );
      return {
        content: this.generateSimulatedMedicalResponse(input, isVision),
        provider: this.name,
        model: this.defaultModel,
        tokensUsed: { promptTokens: 35, completionTokens: 90, totalTokens: 125 },
        latencyMs: Date.now() - startTime
      };
    }

    try {
      const contents = this.buildContents(input, isVision);

      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          const timeoutErr: AIProviderError = {
            provider: this.name,
            isTransient: true,
            isRateLimit: false,
            isAuthError: false,
            statusCode: 408,
            message: `Gemini Flash timed out after ${timeoutMs}ms`
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
          maxOutputTokens: input.maxTokens ?? 1500
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

  private buildContents(input: AIRequest, isVision: boolean): any[] {
    const contents: any[] = [];

    // History
    if (input.history && input.history.length > 0) {
      for (const msg of input.history) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    const currentParts: any[] = [];

    // Attach vision images if present
    if (isVision && input.images && input.images.length > 0) {
      for (const img of input.images) {
        const base64Data =
          typeof img.data === 'string'
            ? img.data.replace(/^data:[^;]+;base64,/, '')
            : img.data.toString('base64');

        currentParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64Data
          }
        });
      }
    }

    currentParts.push({ text: input.prompt });

    contents.push({
      role: 'user',
      parts: currentParts
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
      message: `Gemini Flash error: ${message}`,
      originalError: error
    };
  }

  private generateSimulatedMedicalResponse(input: AIRequest, isVision: boolean): string {
    const clean = input.prompt.toLowerCase();

    if (isVision) {
      return `Detailed clinical document review:\n• Extracted relevant parameters and observed values.\n• All laboratory and prescription notations should be cross-verified with your attending healthcare professional.\n• Note: Isolated values must always be interpreted in the context of your overall medical history.`;
    }

    if (clean.includes('hb') || clean.includes('hemoglobin')) {
      return `Understanding Hemoglobin (Hb) levels:\n• Standard reference intervals for adult males typically range from 13.5 to 17.5 g/dL, and for adult females from 12.0 to 15.5 g/dL.\n• Lower readings may suggest nutritional anemia (such as iron or folate deficiency), while elevated levels can stem from dehydration or chronic hypoxia.\n• Interpretation must be correlated with your symptoms and reviewed by a physician.`;
    }

    return `Thank you for sharing your clinical inquiry: "${input.prompt}".\n\nWhen evaluating symptoms or test parameters, doctors consider history, duration, and physical examination findings. If your symptoms persist or cause discomfort, please schedule a visit with your physician.`;
  }
}

export const geminiFlashProvider = new GeminiFlashProvider();
