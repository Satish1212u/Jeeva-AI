import { AIProviderError } from './providers/types.js';
import { logger } from '../utils/logger.js';

export type ProviderStatus = 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE';

export interface ProviderHealthRecord {
  name: string;
  status: ProviderStatus;
  consecutiveFailures: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastLatencyMs: number | null;
  lastErrorCategory: string | null;
}

export class ProviderHealthTracker {
  private records = new Map<string, ProviderHealthRecord>();

  constructor() {
    this.initProvider('gemini-flash');
    this.initProvider('gemini-flash-lite');
    this.initProvider('grok');
    this.initProvider('openrouter');
  }

  private initProvider(name: string) {
    this.records.set(name, {
      name,
      status: 'HEALTHY',
      consecutiveFailures: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastLatencyMs: null,
      lastErrorCategory: null
    });
  }

  public recordSuccess(provider: string, latencyMs: number): void {
    let rec = this.records.get(provider);
    if (!rec) {
      this.initProvider(provider);
      rec = this.records.get(provider)!;
    }

    rec.totalRequests++;
    rec.successfulRequests++;
    rec.consecutiveFailures = 0;
    rec.status = 'HEALTHY';
    rec.lastSuccessAt = new Date().toISOString();
    rec.lastLatencyMs = latencyMs;
  }

  public recordFailure(provider: string, error: AIProviderError): void {
    let rec = this.records.get(provider);
    if (!rec) {
      this.initProvider(provider);
      rec = this.records.get(provider)!;
    }

    rec.totalRequests++;
    rec.failedRequests++;
    rec.consecutiveFailures++;
    rec.lastFailureAt = new Date().toISOString();

    const errorCategory = error.isAuthError
      ? 'AUTH_ERROR'
      : error.isRateLimit
      ? 'RATE_LIMIT'
      : error.isTransient
      ? 'TRANSIENT_NETWORK'
      : 'CLIENT_ERROR';

    rec.lastErrorCategory = errorCategory;

    // Thresholds for status degradation
    if (error.isAuthError || rec.consecutiveFailures >= 5) {
      rec.status = 'UNAVAILABLE';
    } else if (rec.consecutiveFailures >= 2 || error.isRateLimit) {
      rec.status = 'DEGRADED';
    }

    logger.warn(
      {
        provider,
        errorCategory,
        consecutiveFailures: rec.consecutiveFailures,
        status: rec.status
      },
      'Provider failure recorded in health tracker.'
    );
  }

  public isProviderHealthy(provider: string): boolean {
    const rec = this.records.get(provider);
    if (!rec) return true;
    return rec.status !== 'UNAVAILABLE';
  }

  public getHealthStatus(): Record<string, ProviderHealthRecord> {
    const result: Record<string, ProviderHealthRecord> = {};
    for (const [key, value] of this.records.entries()) {
      result[key] = { ...value };
    }
    return result;
  }

  public resetHealth(provider?: string): void {
    if (provider) {
      this.initProvider(provider);
    } else {
      for (const name of ['gemini-flash', 'gemini-flash-lite', 'grok', 'openrouter']) {
        this.initProvider(name);
      }
    }
  }
}

export const providerHealth = new ProviderHealthTracker();
