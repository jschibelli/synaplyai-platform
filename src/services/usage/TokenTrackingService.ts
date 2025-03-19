import { RedisClient } from '../redis/RedisClient';
import { TenantContext } from '../tenant/TenantContext';
import { MetricsCollector } from '../metrics/MetricsCollector';

interface TokenUsageData {
  tenantId: string;
  modelId: string;
  requestTokens: number;
  responseTokens: number;
  timestamp?: number;
}

export class TokenTrackingService {
  constructor(
    private redisClient: RedisClient,
    private tenantContext: TenantContext,
    private metricsCollector: MetricsCollector
  ) {}

  async trackTokenUsage(data: TokenUsageData): Promise<boolean> {
    const timestamp = data.timestamp || Date.now();
    const dayKey = this.getDayKey(data.tenantId, timestamp);
    const monthKey = this.getMonthKey(data.tenantId, timestamp);

    try {
      const pipeline = this.redisClient.pipeline();

      // Increment daily counters
      pipeline.hincrby(dayKey, `${data.modelId}:request`, data.requestTokens);
      pipeline.hincrby(dayKey, `${data.modelId}:response`, data.responseTokens);
      pipeline.hincrby(dayKey, 'total:request', data.requestTokens);
      pipeline.hincrby(dayKey, 'total:response', data.responseTokens);

      // Increment monthly counters
      pipeline.hincrby(monthKey, `${data.modelId}:request`, data.requestTokens);
      pipeline.hincrby(monthKey, `${data.modelId}:response`, data.responseTokens);
      pipeline.hincrby(monthKey, 'total:request', data.requestTokens);
      pipeline.hincrby(monthKey, 'total:response', data.responseTokens);

      // Set TTL for keys
      pipeline.expire(dayKey, 60 * 60 * 24 * 7); // 7 days
      pipeline.expire(monthKey, 60 * 60 * 24 * 35); // ~35 days

      // Record metrics
      await this.metricsCollector.trackValue('token.usage.request', data.requestTokens, {
        tenantId: data.tenantId,
        modelId: data.modelId
      });

      await this.metricsCollector.trackValue('token.usage.response', data.responseTokens, {
        tenantId: data.tenantId,
        modelId: data.modelId
      });

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Error tracking token usage:', error);
      return false;
    }
  }

  private getDayKey(tenantId: string, timestamp: number): string {
    const date = new Date(timestamp);
    return `usage:${tenantId}:${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  }

  private getMonthKey(tenantId: string, timestamp: number): string {
    const date = new Date(timestamp);
    return `usage:${tenantId}:${date.getFullYear()}-${date.getMonth() + 1}`;
  }

  async getTenantUsage(tenantId: string, modelId?: string): Promise<{
    daily: number;
    monthly: number;
  }> {
    const now = Date.now();
    const dayKey = this.getDayKey(tenantId, now);
    const monthKey = this.getMonthKey(tenantId, now);

    const [dailyUsage, monthlyUsage] = await Promise.all([
      modelId 
        ? this.redisClient.hget(dayKey, `${modelId}:request`)
        : this.redisClient.hget(dayKey, 'total:request'),
      modelId
        ? this.redisClient.hget(monthKey, `${modelId}:request`)
        : this.redisClient.hget(monthKey, 'total:request')
    ]);

    return {
      daily: parseInt(dailyUsage || '0'),
      monthly: parseInt(monthlyUsage || '0')
    };
  }
}