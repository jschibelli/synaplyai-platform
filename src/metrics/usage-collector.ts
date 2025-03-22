// src/metrics/usage-collector.ts
import { Redis } from 'ioredis';
import { getCurrentTenantId } from '../lib/tenantContext';

interface MetricsBucket {
  count: number;
  sum: number;
  min: number;
  max: number;
  p95: number;
}

export class MetricsCollector {
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.redis = redis;
  }

  async trackLatency(operation: string, duration: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    const minute = Math.floor(Date.now() / 60000);
    
    const key = `metrics:${tenantId}:latency:${operation}:${minute}`;
    
    await this.redis.multi()
      .hincrby(key, 'count', 1)
      .hincrby(key, 'total', duration)
      .zadd(`metrics:${tenantId}:p95:${operation}`, duration, Date.now())
      .expire(key, 86400) // 24h retention
      .exec();
  }

  async getP95Latency(operation: string, minutes: number = 5): Promise<number> {
    const tenantId = getCurrentTenantId();
    const now = Date.now();
    const windowStart = now - (minutes * 60000);
    
    const values = await this.redis.zrangebyscore(
      `metrics:${tenantId}:p95:${operation}`,
      windowStart,
      now
    );
    
    if (!values.length) return 0;
    const p95Index = Math.floor(values.length * 0.95);
    return Number(values[p95Index]);
  }
}

export class EnhancedMetricsCollector extends MetricsCollector {
  async trackDetailedLatency(operation: string, duration: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    const minute = Math.floor(Date.now() / 60000);
    const hour = Math.floor(minute / 60);
    
    const pipeline = this.redis.pipeline();
    
    // Update minute-level metrics
    pipeline.zadd(`metrics:${tenantId}:${operation}:${minute}`, duration, Date.now());
    pipeline.expire(`metrics:${tenantId}:${operation}:${minute}`, 3600); // 1 hour
    
    // Update hour-level aggregates
    pipeline.hincrby(`metrics:${tenantId}:${operation}:${hour}`, 'count', 1);
    pipeline.hincrby(`metrics:${tenantId}:${operation}:${hour}`, 'sum', duration);
    pipeline.expire(`metrics:${tenantId}:${operation}:${hour}`, 86400); // 24 hours
    
    await pipeline.exec();
  }

  async getDetailedMetrics(operation: string, timeRange: number): Promise<MetricsBucket> {
    // Implementation for calculating detailed metrics
  }
}