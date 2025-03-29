import { mockRedisClient } from '../../redis/mockRedisClient';
import { TenantContext } from '../../tenant/TenantContext';

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

export interface MetricsCollector {
  increment(metric: string, tags?: Record<string, string>): Promise<void>;
  incrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  decrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  recordLatency(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  recordValue(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  getCounter(metric: string, tags?: Record<string, string>): Promise<number>;
  getAverageValue(metric: string, tags?: Record<string, string>): Promise<number>;
  track(eventName: string, properties?: Record<string, any>): Promise<void>;
}

/**
 * Metrics collector implementation
 */
export class MetricsCollector implements MetricsCollector {
  private metrics: Map<string, number> = new Map();
  private redisClient: any;

  constructor(redisClient: any) {
    this.redisClient = redisClient;
  }

  /**
   * Increment a counter
   */
  async increment(metric: string, tags?: Record<string, string>): Promise<void> {
    const key = this.formatKey(metric, tags);
    const currentValue = this.metrics.get(key) || 0;
    this.metrics.set(key, currentValue + 1);
    
    // Also store in Redis for persistence
    await this.redisClient.incr(key);
  }

  /**
   * Increment a counter and return the new value
   */
  async incrementCounter(key: string, tags?: Record<string, string>): Promise<number> {
    const metricKey = this.formatKey(key, tags);
    const currentValue = this.metrics.get(metricKey) || 0;
    const newValue = currentValue + 1;
    this.metrics.set(metricKey, newValue);
    
    // Also store in Redis for persistence
    await this.redisClient.incr(metricKey);
    
    return newValue;
  }

  /**
   * Decrement a counter and return the new value
   */
  async decrementCounter(key: string, tags?: Record<string, string>): Promise<number> {
    const metricKey = this.formatKey(key, tags);
    const currentValue = this.metrics.get(metricKey) || 0;
    const newValue = Math.max(0, currentValue - 1);
    this.metrics.set(metricKey, newValue);
    
    // Also store in Redis for persistence
    await this.redisClient.decr(metricKey);
    
    return newValue;
  }

  /**
   * Record a latency value
   */
  async recordLatency(metric: string, value: number, tags?: Record<string, string>): Promise<void> {
    // For latency we use different Redis structures
    const key = this.formatKey(metric, tags);
    
    // Store the individual value
    await this.redisClient.rPush(`${key}:values`, value.toString());
    
    // Update the running average
    const avgKey = `${key}:avg`;
    const countKey = `${key}:count`;
    
    const count = parseInt(await this.redisClient.get(countKey) || '0') + 1;
    const currentAvg = parseFloat(await this.redisClient.get(avgKey) || '0');
    
    const newAvg = ((currentAvg * (count - 1)) + value) / count;
    
    await this.redisClient.set(avgKey, newAvg.toString());
    await this.redisClient.set(countKey, count.toString());
  }

  /**
   * Record a numeric value
   */
  async recordValue(metric: string, value: number, tags?: Record<string, string>): Promise<void> {
    const key = this.formatKey(metric, tags);
    
    // Store the individual value
    await this.redisClient.rPush(`${key}:values`, value.toString());
    
    // Update the running average
    const avgKey = `${key}:avg`;
    const countKey = `${key}:count`;
    
    const count = parseInt(await this.redisClient.get(countKey) || '0') + 1;
    const currentAvg = parseFloat(await this.redisClient.get(avgKey) || '0');
    
    const newAvg = ((currentAvg * (count - 1)) + value) / count;
    
    await this.redisClient.set(avgKey, newAvg.toString());
    await this.redisClient.set(countKey, count.toString());
  }

  /**
   * Get a counter value
   */
  async getCounter(metric: string, tags?: Record<string, string>): Promise<number> {
    const key = this.formatKey(metric, tags);
    const value = await this.redisClient.get(key);
    return parseInt(value || '0');
  }

  /**
   * Get the average value of a metric
   */
  async getAverageValue(metric: string, tags?: Record<string, string>): Promise<number> {
    const key = this.formatKey(metric, tags);
    const avgKey = `${key}:avg`;
    
    const value = await this.redisClient.get(avgKey);
    return parseFloat(value || '0');
  }

  /**
   * Track an event with properties
   */
  async track(eventName: string, properties?: Record<string, any>): Promise<void> {
    const event = {
      name: eventName,
      timestamp: new Date().toISOString(),
      ...properties
    };
    
    // Store event in Redis
    await this.redisClient.rPush('events', JSON.stringify(event));
    
    // For each property, increment a counter
    if (properties) {
      for (const [key, value] of Object.entries(properties)) {
        if (typeof value === 'string') {
          const metricKey = `${eventName}.${key}.${value}`;
          await this.increment(metricKey);
        }
      }
    }
  }

  /**
   * Format a metric key with tags
   */
  private formatKey(metric: string, tags?: Record<string, string>): string {
    if (!tags) return metric;
    
    const tagString = Object.entries(tags)
      .map(([k, v]) => `${k}:${v}`)
      .join('.');
    
    return `${metric}.${tagString}`;
  }

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