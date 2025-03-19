import { RedisClient } from '../redis/RedisClient';
import { TenantContext } from '../tenant/TenantContext';

interface MetricData {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

interface MetricsBucket {
  count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p95: number;
}

export class MetricsCollector {
  constructor(
    private redisClient: RedisClient,
    private tenantContext: TenantContext
  ) {}

  async trackMetric(data: MetricData): Promise<boolean> {
    const timestamp = data.timestamp || Date.now();
    const tenantId = this.tenantContext.getCurrentTenant();
    
    try {
      const pipeline = this.redisClient.pipeline();
      const minute = Math.floor(timestamp / 60000);
      const hour = Math.floor(minute / 60);
      const day = Math.floor(hour / 24);

      // Keys for different granularities
      const keys = {
        minute: `metrics:${tenantId}:${data.name}:${minute}`,
        hour: `metrics:${tenantId}:${data.name}:${hour}`,
        day: `metrics:${tenantId}:${data.name}:${day}`
      };

      // Store raw value for percentile calculations
      pipeline.zadd(keys.minute, data.value, `${timestamp}:${Math.random()}`);

      // Update aggregates for each granularity
      for (const [granularity, key] of Object.entries(keys)) {
        pipeline.hincrby(key, 'count', 1);
        pipeline.hincrbyfloat(key, 'sum', data.value);
        
        // Set TTL based on granularity
        const ttl = this.getTTL(granularity);
        pipeline.expire(key, ttl);
      }

      // Store tags if provided
      if (data.tags) {
        const tagKey = `tags:${tenantId}:${data.name}`;
        for (const [tag, value] of Object.entries(data.tags)) {
          pipeline.hset(tagKey, tag, value);
        }
        pipeline.expire(tagKey, 86400 * 30); // 30 days TTL for tags
      }

      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('Error tracking metric:', error);
      return false;
    }
  }

  async getMetrics(name: string, options: {
    granularity: 'minute' | 'hour' | 'day',
    range: { start: number; end: number },
    tags?: Record<string, string>
  }): Promise<MetricsBucket[]> {
    const tenantId = this.tenantContext.getCurrentTenant();
    const { granularity, range, tags } = options;

    // Calculate bucket timestamps
    const buckets = this.getBucketRange(granularity, range.start, range.end);
    const results: MetricsBucket[] = [];

    for (const bucket of buckets) {
      const key = `metrics:${tenantId}:${name}:${bucket}`;
      const data = await this.redisClient.hgetall(key);

      if (data) {
        results.push({
          count: parseInt(data.count || '0'),
          sum: parseFloat(data.sum || '0'),
          min: parseFloat(data.min || '0'),
          max: parseFloat(data.max || '0'),
          avg: parseFloat(data.sum || '0') / (parseInt(data.count || '1')),
          p95: await this.calculateP95(key)
        });
      }
    }

    return results;
  }

  private getTTL(granularity: string): number {
    switch (granularity) {
      case 'minute': return 60 * 60; // 1 hour
      case 'hour': return 60 * 60 * 24; // 1 day
      case 'day': return 60 * 60 * 24 * 30; // 30 days
      default: return 60 * 60 * 24; // 1 day default
    }
  }

  private getBucketRange(granularity: string, start: number, end: number): number[] {
    const buckets: number[] = [];
    const interval = this.getInterval(granularity);
    
    for (let timestamp = start; timestamp <= end; timestamp += interval) {
      buckets.push(Math.floor(timestamp / interval));
    }
    
    return buckets;
  }

  private getInterval(granularity: string): number {
    switch (granularity) {
      case 'minute': return 60000; // 1 minute in ms
      case 'hour': return 3600000; // 1 hour in ms
      case 'day': return 86400000; // 1 day in ms
      default: return 3600000; // 1 hour default
    }
  }

  private async calculateP95(key: string): Promise<number> {
    const count = await this.redisClient.zcard(key);
    if (count === 0) return 0;

    const index = Math.ceil(count * 0.95) - 1;
    const result = await this.redisClient.zrange(key, index, index, 'WITHSCORES');
    return result.length >= 2 ? parseFloat(result[1]) : 0;
  }
}