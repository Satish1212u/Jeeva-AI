import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  AIProvider,
  AIProviderError,
  AIRequest,
  AIResponse
} from './types.js';

export class OpenRouterProvider implements AIProvider {
  public readonly name = 'openrouter';
  public readonly defaultModel: string;
  private http: AxiosInstance | null = null;

  constructor(modelName?: string) {
    this.defaultModel = modelName || env.OPENROUTER_MODEL || 'openrouter/free';
    if (env.OPENROUTER_API_KEY && env.OPENROUTER_API_KEY.trim().length > 0) {
      this.http = axios.create({
        baseURL: 'https://openrouter.ai/api/v1',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
          'HTTP-Referer': env.APP_URL || 'https://medai.local',
          'X-Title': 'MedAI Medical Assistant'
        }
      });
    }
  }

  public async isAvailable(): Promise<boolean> {
    return !!this.http || env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
  }

  public async generateText(input: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const timeoutMs = input.timeoutMs || env.AI_REQUEST_TIMEOUT_MS || 30000;

    // Simulated fallback for test / key-less dev environment
    if (!this.http) {
      logger.info(
        { provider: this.name, model: this.defaultModel, requestType: input.requestType },
        'OpenRouter API key not supplied; executing simulated final fallback response.'
      );
      return {
        content: `[OpenRouter Fallback Assistance]\nRegarding: "${input.prompt}". Healthcare decisions require tailored medical evaluation. Please consult your physician.`,
        provider: this.name,
        model: this.defaultModel,
        tokensUsed: { promptTokens: 20, completionTokens: 35, totalTokens: 55 },
        latencyMs: Date.now() - startTime
      };
    }

    try {
      const messages = this.buildMessages(input);

      const response = await this.http.post(
        '/chat/completions',
        {
          model: this.defaultModel,
          messages,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 1000
        },
        { timeout: timeoutMs }
      );

      const latencyMs = Date.now() - startTime;
      const choice = response.data?.choices?.[0]?.message?.content || '';
      const usage = response.data?.usage;

      return {
        content: choice,
        provider: this.name,
        model: this.defaultModel,
        tokensUsed: usage
          ? {
              promptTokens: usage.prompt_tokens,
              completionTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens
            }
          : undefined,
        latencyMs
      };
    } catch (error: any) {
      throw this.normalizeError(error);
    }
  }

  private buildMessages(input: AIRequest): any[] {
    const messages: any[] = [];

    if (input.systemInstruction) {
      messages.push({ role: 'system', content: input.systemInstruction });
    }

    if (input.history && input.history.length > 0) {
      for (const msg of input.history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: input.prompt });
    return messages;
  }

  private normalizeError(error: any): AIProviderError {
    const status = error.response?.status || 500;
    const dataMessage = error.response?.data?.error?.message || error.message;

    const isRateLimit = status === 429 || /rate limit|quota/i.test(dataMessage);
    const isAuthError = status === 401 || status === 403 || /unauthorized|api key/i.test(dataMessage);
    const isTransient =
      isRateLimit ||
      status >= 500 ||
      error.code === 'ECONNABORTED' ||
      /timeout|econnreset/i.test(dataMessage);

    return {
      provider: this.name,
      isTransient,
      isRateLimit,
      isAuthError,
      statusCode: status,
      message: `OpenRouter error: ${dataMessage}`,
      originalError: error
    };
  }
}

export const openRouterProvider = new OpenRouterProvider();
