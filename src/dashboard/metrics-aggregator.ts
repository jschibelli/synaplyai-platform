import { Redis } from 'ioredis';
import { getCurrentTenantId } from '../lib/tenantContext';

interface AggregatedMetrics {
  min: number;
  max: number;
  avg: number;
  p95: number;
  count: number;
  timestamp: number;
}

export class MetricsAggregator {
  private static readonly AGGREGATION_WINDOW = 60000; // 1 minute
  private buffer: Map<string, number[]> = new Map();
  private lastFlush = Date.now();
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async addMetric(key: string, value: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    const metricKey = `${tenantId}:${key}`;

    if (!this.buffer.has(metricKey)) {
      this.buffer.set(metricKey, []);
    }
    
    this.buffer.get(metricKey)!.push(value);
    await this.checkFlush();
  }

  private async checkFlush(): Promise<void> {
    const now = Date.now();
    if (now - this.lastFlush >= MetricsAggregator.AGGREGATION_WINDOW) {
      await this.flushMetrics();
      this.lastFlush = now;
    }
  }

  private async flushMetrics(): Promise<void> {
    const pipeline = this.redis.pipeline();
    const timestamp = Math.floor(Date.now() / MetricsAggregator.AGGREGATION_WINDOW) * MetricsAggregator.AGGREGATION_WINDOW;

    for (const [key, values] of this.buffer.entries()) {
      if (values.length === 0) continue;

      // Sort values for percentile calculation
      const sorted = [...values].sort((a, b) => a - b);
      const p95Index = Math.floor(sorted.length * 0.95);

      const metrics: AggregatedMetrics = {
        min: Math.min(...values),
        max: Math.max(...values),
        avg: values.reduce((a, b) => a + b) / values.length,
        p95: sorted[p95Index],
        count: values.length,
        timestamp
      };

      pipeline.zadd(
        `metrics:${key}`,
        timestamp,
        JSON.stringify(metrics)
      );

      // Keep only last 24 hours of metrics
      pipeline.zremrangebyscore(
        `metrics:${key}`,
        '-inf',
        timestamp - 86400000 // 24 hours in milliseconds
      );
    }

    await pipeline.exec();
    this.buffer.clear();
  }

  async getMetrics(key: string, start: number, end: number): Promise<AggregatedMetrics[]> {
    const tenantId = getCurrentTenantId();
    const metricKey = `metrics:${tenantId}:${key}`;

    const rawMetrics = await this.redis.zrangebyscore(
      metricKey,
      start,
      end
    );

    return rawMetrics.map(metric => JSON.parse(metric));
  }

  async getLatestMetrics(key: string): Promise<AggregatedMetrics | null> {
    const tenantId = getCurrentTenantId();
    const metricKey = `metrics:${tenantId}:${key}`;

    const latest = await this.redis.zrevrangebyscore(
      metricKey,
      '+inf',
      '-inf',
      'LIMIT',
      0,
      1
    );

    return latest.length > 0 ? JSON.parse(latest[0]) : null;
  }

  async cleanup(): Promise<void> {
    // Force flush any remaining metrics
    await this.flushMetrics();
  }
}