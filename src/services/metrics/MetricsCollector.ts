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
  recordLatency(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  increment(key: string, value: number, tags?: Record<string, any>): Promise<void>;
  incrementCounter(key: string, tags?: Record<string, string>): Promise<void>;
  decrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  recordValue(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  getCounter(metric: string, tags?: Record<string, string>): Promise<number>;
  getAverageValue(metric: string, tags?: Record<string, string>): Promise<number>;
  getCountValue(metric: string, tags?: Record<string, string>): Promise<number>;
  track(eventName: string, properties?: Record<string, any>): Promise<void>;
  track(metricName: string, value: number, tags?: Record<string, any>): Promise<void>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: string): Promise<void>;
  getCircuitBreakerState(tenantId: string, serviceName: string): Promise<string>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  getFilterResultCounts(tenantId: string): Promise<Record<string, number>>;
  getPercentileLatency(metric: string, percentile: number, tags?: Record<string, string>): Promise<number>;
  getPipelineLatency(tenantId: string, pipeline: string): Promise<number>;
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
  async increment(key: string, value: number = 1, tags?: Record<string, any>): Promise<void> {
    const formattedKey = this.formatKey(key, tags);
    this.metrics.set(formattedKey, (this.metrics.get(formattedKey) || 0) + value);
  }

  /**
   * Record operation latency
   */
  async recordLatency(metric: string, value: number, tags?: Record<string, string>): Promise<void> {
    const key = this.formatKey(`${metric}.latency`, tags);
    this.metrics.set(key, value);
  }

  /**
   * Increment a counter specific to a metric
   */
  async incrementCounter(key: string, tags?: Record<string, string>): Promise<void> {
    const formattedKey = this.formatKey(key, tags);
    this.metrics.set(formattedKey, (this.metrics.get(formattedKey) || 0) + 1);
  }

  /**
   * Decrement a counter
   */
  async decrementCounter(key: string, tags?: Record<string, string>): Promise<number> {
    const formattedKey = this.formatKey(key, tags);
    const newValue = (this.metrics.get(formattedKey) || 0) - 1;
    this.metrics.set(formattedKey, newValue);
    return newValue;
  }
  
  /**
   * Get counter value
   */
  async getCounter(metric: string, tags?: Record<string, string>): Promise<number> {
    const key = this.formatKey(metric, tags);
    return this.metrics.get(key) || 0;
  }

  /**
   * Record a value
   */
  async recordValue(metric: string, value: number, tags?: Record<string, string>): Promise<void> {
    const key = this.formatKey(metric, tags);
    this.metrics.set(key, value);
  }

  /**
   * Get average value
   */
  async getAverageValue(metric: string, tags?: Record<string, string>): Promise<number> {
    return this.getCounter(metric, tags) || 0;
  }

  /**
   * Get count value
   */
  async getCountValue(metric: string, tags?: Record<string, string>): Promise<number> {
    return this.getCounter(metric, tags) || 0;
  }

  /**
   * Format a key with tags
   */
  formatKey(key: string, tags?: Record<string, any>): string {
    if (!tags) return key;
    
    const tagString = Object.entries(tags)
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
      
    return `${key}:${tagString}`;
  }

  /**
   * Track event or metric
   */
  async track(nameOrMetric: string, valueOrProps?: any, tags?: Record<string, any>): Promise<void> {
    if (typeof valueOrProps === 'number') {
      // Track metric
      const key = this.formatKey(nameOrMetric, tags);
      this.metrics.set(key, valueOrProps);
    } else {
      // Track event
      const key = this.formatKey(`event.${nameOrMetric}`, valueOrProps);
      this.metrics.set(key, 1);
    }
  }

  /**
   * Set circuit breaker state
   */
  async setCircuitBreakerState(tenantId: string, serviceName: string, state: string): Promise<void> {
    const key = `circuit.${tenantId}.${serviceName}.state`;
    this.metrics.set(key, state === 'OPEN' ? 1 : 0);
  }

  /**
   * Get circuit breaker state
   */
  async getCircuitBreakerState(tenantId: string, serviceName: string): Promise<string> {
    const key = `circuit.${tenantId}.${serviceName}.state`;
    return this.metrics.get(key) ? 'OPEN' : 'CLOSED';
  }

  /**
   * Increment circuit breaker failures
   */
  async incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void> {
    const key = `circuit.${tenantId}.${serviceName}.failures`;
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
  }

  /**
   * Increment circuit breaker rejections
   */
  async incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void> {
    const key = `circuit.${tenantId}.${serviceName}.rejections`;
    this.metrics.set(key, (this.metrics.get(key) || 0) + 1);
  }

  /**
   * Get filter result counts
   */
  async getFilterResultCounts(tenantId: string): Promise<Record<string, number>> {
    return {
      ALLOWED: this.metrics.get(`filter.${tenantId}.ALLOWED`) || 0,
      BLOCKED: this.metrics.get(`filter.${tenantId}.BLOCKED`) || 0,
      FLAGGED: this.metrics.get(`filter.${tenantId}.FLAGGED`) || 0
    };
  }

  /**
   * Get percentile latency
   */
  async getPercentileLatency(metric: string, percentile: number, tags?: Record<string, string>): Promise<number> {
    // Simplified mock implementation
    return this.metrics.get(this.formatKey(`${metric}.p${percentile}`, tags)) || 0;
  }

  /**
   * Get pipeline latency
   */
  async getPipelineLatency(tenantId: string, pipeline: string): Promise<number> {
    return this.metrics.get(`pipeline.${tenantId}.${pipeline}.latency`) || 0;
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