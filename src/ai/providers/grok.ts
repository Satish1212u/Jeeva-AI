import axios, { AxiosInstance } from 'axios';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import {
  AIProvider,
  AIProviderError,
  AIRequest,
  AIResponse
} from './types.js';

export class GrokProvider implements AIProvider {
  public readonly name = 'grok';
  public readonly defaultModel: string;
  private http: AxiosInstance | null = null;

  constructor(modelName?: string) {
    this.defaultModel = modelName || env.GROK_MODEL || 'grok-4.6';
    if (env.GROK_API_KEY && env.GROK_API_KEY.trim().length > 0) {
      this.http = axios.create({
        baseURL: 'https://api.x.ai/v1',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${env.GROK_API_KEY}`
        }
      });
    }
  }

  public async isAvailable(): Promise<boolean> {
    return !!this.http || env.NODE_ENV === 'test' || env.NODE_ENV === 'development';
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

    // Simulated fallback for test / key-less dev environment
    if (!this.http) {
      logger.info(
        { provider: this.name, model: this.defaultModel, requestType: input.requestType },
        'Grok API key not supplied; executing simulated fallback response.'
      );
      return {
        content: `[Grok Fallback Assistance]\nRegarding your health question: "${input.prompt}". Please observe symptoms closely and verify any recommendations with your primary physician.`,
        provider: this.name,
        model: this.defaultModel,
        tokensUsed: { promptTokens: 25, completionTokens: 45, totalTokens: 70 },
        latencyMs: Date.now() - startTime
      };
    }

    try {
      const messages = this.buildMessages(input, isVision);

      const response = await this.http.post(
        '/chat/completions',
        {
          model: this.defaultModel,
          messages,
          temperature: input.temperature ?? 0.2,
          max_tokens: input.maxTokens ?? 1200
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

  private buildMessages(input: AIRequest, isVision: boolean): any[] {
    const messages: any[] = [];

    if (input.systemInstruction) {
      messages.push({ role: 'system', content: input.systemInstruction });
    }

    if (input.history && input.history.length > 0) {
      for (const msg of input.history) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    if (isVision && input.images && input.images.length > 0) {
      const contentParts: any[] = [{ type: 'text', text: input.prompt }];
      for (const img of input.images) {
        const base64 =
          typeof img.data === 'string'
            ? img.data.replace(/^data:[^;]+;base64,/, '')
            : img.data.toString('base64');
        contentParts.push({
          type: 'image_url',
          image_url: {
            url: `data:${img.mimeType};base64,${base64}`
          }
        });
      }
      messages.push({ role: 'user', content: contentParts });
    } else {
      messages.push({ role: 'user', content: input.prompt });
    }

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
      message: `Grok error: ${dataMessage}`,
      originalError: error
    };
  }
}

export const grokProvider = new GrokProvider();
