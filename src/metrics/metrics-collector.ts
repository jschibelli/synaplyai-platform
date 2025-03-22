import { CircuitState } from '../circuit-breaker/interfaces';
import { ContentFilterResult } from '../filtering/interfaces';
import { getCurrentTenantId } from '../lib/tenant-context';
import { Redis } from 'ioredis';

// Define a complete RedisMetricsClient interface that matches your implementation
interface RedisMetricsClient {
  incrementCounter(metricName: string, tenantId: string, value?: number): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void>;
  getPercentileLatency(metricName: string, tenantId: string, percentile: number, timeWindowMinutes?: number): Promise<number | null>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void>;
  getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null>;
  recordValue(metricName: string, value: number, tenantId: string): Promise<void>;
  getFilterResultCounts(filterName: string, timeWindow: number, tenantId: string): Promise<Array<{result: string, count: number}>>;
  getPipelineLatency(percentile: number, timeWindow: number, tenantId: string): Promise<number | null>;
  pipeline(): any; // Add this method to the interface
}

export interface IMetricsCollector {
  increment(metricName: string, tenantId: string, value?: number): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void>;
  getPercentileLatency(metricName: string, tenantId: string, percentile: number): Promise<number | null>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null>;
  incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void>;
  recordFilterLatency(filterName: string, latencyMs: number): Promise<void>;
  recordPipelineLatency(latencyMs: number): Promise<void>;
  incrementPipelineResult(result: ContentFilterResult): Promise<void>;
  incrementPipelineErrors(): Promise<void>;
}

export class MetricsCollector implements IMetricsCollector {
  private metrics: Map<string, number> = new Map();

  constructor(private redisClient: RedisMetricsClient) {}

  async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
    await this.redisClient.incrementCounter(metricName, tenantId, value);
  }

  async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
    await this.redisClient.recordLatency(metricName, latencyMs, tenantId);
  }

  async getPercentileLatency(metricName: string, tenantId: string, percentile: number): Promise<number | null> {
    return await this.redisClient.getPercentileLatency(metricName, tenantId, percentile, 5);
  }

  async setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void> {
    await this.increment(`circuit.state.${state.toLowerCase()}`, tenantId);
    // Add a null check for optional redisClient methods
    if (this.redisClient.setCircuitBreakerState) {
      await this.redisClient.setCircuitBreakerState(tenantId, serviceName, state);
    }
  }

  async incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void> {
    await this.increment(`circuit.failure.${serviceName}`, tenantId);
  }

  async incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void> {
    await this.increment(`circuit.rejection.${serviceName}`, tenantId);
  }

  async getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null> {
    // Add a null check for optional redisClient methods
    if (this.redisClient.getCircuitBreakerState) {
      return await this.redisClient.getCircuitBreakerState(tenantId, serviceName);
    }
    return null;
  }

  // Content filtering metrics implementation
  async incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment(`filter.result.${filterName}.${result}`, tenantId);
  }

  async recordFilterLatency(filterName: string, latencyMs: number): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.recordLatency(`filter.latency.${filterName}`, latencyMs, tenantId);
  }

  async recordPipelineLatency(latencyMs: number): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.recordLatency('pipeline.latency', latencyMs, tenantId);
  }

  async incrementPipelineResult(result: ContentFilterResult): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment(`pipeline.result.${result}`, tenantId);
  }

  async incrementPipelineErrors(): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment('pipeline.errors', tenantId);
  }

  // Metric aggregation and advanced tracking
  async trackIdentifier(name: string, identifier: string): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment(name, tenantId);
  }

  async trackEvent(name: string, tags?: Record<string, string | number>): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';

    await this.increment(name, tenantId);

    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        await this.increment(`${name}.${key}.${value}`, tenantId);
      }
    }
  }

  async trackValue(name: string, value: number, tags?: Record<string, string | number>): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';

    if (this.redisClient.recordValue) {
      await this.redisClient.recordValue(name, value, tenantId);

      if (tags) {
        for (const [key, tagValue] of Object.entries(tags)) {
          await this.redisClient.recordValue(`${name}.${key}.${tagValue}`, value, tenantId);
        }
      }
    }
  }

  async getFilterResults(filterName: string, timeWindow: number = 60): Promise<Array<{result: string, count: number}>> {
    const tenantId = getCurrentTenantId() || 'unknown';
    if (this.redisClient.getFilterResultCounts) {
      return await this.redisClient.getFilterResultCounts(filterName, timeWindow, tenantId);
    }
    return [];
  }

  async getPipelineLatency(percentile: number = 95, timeWindow: number = 60): Promise<number | null> {
    const tenantId = getCurrentTenantId() || 'unknown';
    if (this.redisClient.getPipelineLatency) {
      return await this.redisClient.getPipelineLatency(percentile, timeWindow, tenantId);
    }
    return null;
  }

  /**
   * Record latency for a specific operation
   */
  async recordLatency(metricName: string, duration: number): Promise<void> {
    try {
      // Store local cache for faster test execution
      const key = `latency.${metricName}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + duration);
      this.metrics.set(`${key}.count`, (this.metrics.get(`${key}.count`) || 0) + 1);

      console.log(`Recorded latency for ${metricName}: ${duration}ms`);
    } catch (error) {
      console.error('Error recording latency metric:', error);
    }
  }

  /**
   * Track value for a specific metric
   */
  async track(metricName: string, value: number, tags?: Record<string, any>): Promise<void> {
    try {
      const key = `track.${metricName}`;
      this.metrics.set(key, value);

      console.log(`Tracked ${metricName}: ${value}`, tags);
    } catch (error) {
      console.error('Error tracking metric:', error);
    }
  }

  /**
   * Increment counter by specified value
   */
  async increment(metricName: string, value: number = 1): Promise<void> {
    try {
      const key = `count.${metricName}`;
      this.metrics.set(key, (this.metrics.get(key) || 0) + value);

      console.log(`Incremented ${metricName} by ${value}`);
    } catch (error) {
      console.error('Error incrementing metric:', error);
    }
  }

  /**
   * Record specific value
   */
  async recordValue(metricName: string, value: number): Promise<void> {
    try {
      const key = `value.${metricName}`;
      this.metrics.set(key, value);

      console.log(`Recorded value for ${metricName}: ${value}`);
    } catch (error) {
      console.error('Error recording value metric:', error);
    }
  }

  /**
   * Get average value for a latency metric
   */
  async getAverageValue(metricName: string, options?: any): Promise<number> {
    try {
      const key = `latency.${metricName}`;
      const sum = this.metrics.get(key) || 0;
      const count = this.metrics.get(`${key}.count`) || 1;

      return sum / count;
    } catch (error) {
      console.error('Error calculating average value:', error);
      return 0;
    }
  }

  /**
   * Get count value for a specific metric
   */
  async getCountValue(metricName: string, options?: any): Promise<number> {
    try {
      const key = `count.${metricName}`;
      return this.metrics.get(key) || 0;
    } catch (error) {
      console.error('Error getting count value:', error);
      return 0;
    }
  }

  /**
   * Set circuit breaker state
   */
  async setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void> {
    try {
      const key = `circuitbreaker.${tenantId}.${serviceName}.state`;
      this.metrics.set(key, state === CircuitState.OPEN ? 1 : state === CircuitState.HALF_OPEN ? 0.5 : 0);

      await this.increment(`circuit.state.${state.toLowerCase()}`, 1);
      console.log(`Circuit breaker state for ${tenantId}/${serviceName} set to ${state}`);
    } catch (error) {
      console.error('Error setting circuit breaker state:', error);
    }
  }

  /**
   * Record circuit breaker rejections
   */
  async incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void> {
    try {
      await this.increment(`circuit.rejection.${serviceName}`, 1);
    } catch (error) {
      console.error('Error incrementing circuit breaker rejections:', error);
    }
  }

  /**
   * Record circuit breaker failures
   */
  async incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void> {
    try {
      await this.increment(`circuit.failure.${serviceName}`, 1);
    } catch (error) {
      console.error('Error incrementing circuit breaker failures:', error);
    }
  }

  /**
   * Reset all metrics - useful for testing
   */
  async reset(): Promise<void> {
    this.metrics.clear();
  }
}

// Only declare public 'rollingWindows' property in the base class
export class EnhancedMetricsCollector extends MetricsCollector {
  public rollingWindows: number[] = [1, 5, 15, 60]; // 1min, 5min, 15min, 1hour windows
  private redisInstance: Redis | null = null;

  /**
   * Set Redis instance for direct Redis operations
   * This is required for detailed metrics features like P95 calculations
   * @param redis Redis instance
   */
  public setRedisInstance(redis: Redis): void {
    this.redisInstance = redis;
  }

  /**
   * Track detailed latency metrics with fine-grained time bucketing
   * Migrated from usage-collector.ts
   * @param operation Operation name to track
   * @param duration Duration in milliseconds
   */
  async trackDetailedLatency(operation: string, duration: number): Promise<void> {
    if (!this.redisInstance) {
      console.error('Redis instance not set for detailed metrics');
      return;
    }

    const tenantId = getCurrentTenantId() || 'unknown';
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const hour = Math.floor(minute / 60);
    const day = Math.floor(hour / 24);
    
    const pipeline = this.redisInstance.pipeline();
    
    // Minute level - raw data for p95 calculation
    pipeline.zadd(`metrics:${tenantId}:latency:${operation}:${minute}`, duration, now + Math.random());
    pipeline.expire(`metrics:${tenantId}:latency:${operation}:${minute}`, 3600); // 1 hour
    
    // Hour level - aggregated data
    const hourKey = `metrics:${tenantId}:latency:${operation}:hour:${hour}`;
    pipeline.hincrby(hourKey, 'count', 1);
    pipeline.hincrby(hourKey, 'total', duration);
    pipeline.hincrby(hourKey, 'max', Math.max(0, duration)); 
    pipeline.hincrby(hourKey, 'min', Math.min(Number.MAX_SAFE_INTEGER, duration));
    pipeline.expire(hourKey, 86400); // 24 hours
    
    // Day level - aggregated data
    const dayKey = `metrics:${tenantId}:latency:${operation}:day:${day}`;
    pipeline.hincrby(dayKey, 'count', 1);
    pipeline.hincrby(dayKey, 'total', duration);
    pipeline.expire(dayKey, 2592000); // 30 days

    // Also add to P95 sorted set for percentile calculations
    pipeline.zadd(`metrics:${tenantId}:p95:${operation}`, duration, now);
    pipeline.zremrangebyscore(`metrics:${tenantId}:p95:${operation}`, '-inf', now - 86400000); // Keep 24h
    
    await pipeline.exec();
  }

  /**
   * Calculate P95 latency over a time window
   * Migrated from usage-collector.ts
   * @param operation Operation name
   * @param minutes Time window in minutes
   * @returns P95 latency value
   */
  async getP95Latency(operation: string, minutes: number = 5): Promise<number> {
    if (!this.redisInstance) {
      console.error('Redis instance not set for detailed metrics');
      return 0;
    }

    const tenantId = getCurrentTenantId() || 'unknown';
    const now = Date.now();
    const windowStart = now - (minutes * 60000);
    
    const values = await this.redisInstance.zrangebyscore(
      `metrics:${tenantId}:p95:${operation}`,
      windowStart,
      now
    );
    
    if (!values.length) return 0;
    
    // Sort the values to find the P95 point
    const sortedValues = values.map(v => parseFloat(v)).sort((a, b) => a - b);
    const p95Index = Math.floor(sortedValues.length * 0.95);
    return sortedValues[p95Index] || 0;
  }

  /**
   * Get detailed metrics for an operation
   * @param operation Operation name
   * @param timeRangeMinutes Time range in minutes
   * @returns Detailed metrics object
   */
  async getDetailedMetrics(operation: string, timeRangeMinutes: number): Promise<{
    min: number;
    max: number;
    avg: number;
    p95: number;
    count: number;
  }> {
    if (!this.redisInstance) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p95: 0,
        count: 0
      };
    }

    const tenantId = getCurrentTenantId() || 'unknown';
    const now = Date.now();
    const p95 = await this.getP95Latency(operation, timeRangeMinutes);
    
    // Get the appropriate time bucket
    const hour = Math.floor(now / 3600000);
    const hourKey = `metrics:${tenantId}:latency:${operation}:hour:${hour}`;
    
    const data = await this.redisInstance.hgetall(hourKey);
    
    if (!data || !data.count) {
      return {
        min: 0,
        max: 0,
        avg: 0,
        p95,
        count: 0
      };
    }
    
    return {
      min: parseInt(data.min || '0', 10),
      max: parseInt(data.max || '0', 10),
      avg: parseInt(data.total || '0', 10) / parseInt(data.count || '1', 10),
      p95,
      count: parseInt(data.count || '0', 10)
    };
  }

  // Existing recordBatchedMetrics method
  async recordBatchedMetrics(
    metrics: Array<{name: string, value: number, tags?: Record<string, string | number>}>
  ): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';

    if (!metrics.length) return;

    if (this.redisClient.pipeline) {
      const pipeline = this.redisClient.pipeline();

      // Process pipeline methods here

      await pipeline.exec();
    } else {
      // Fall back to individual recording if pipeline not available
      for (const metric of metrics) {
        await this.trackValue(metric.name, metric.value, metric.tags);
      }
    }
  }
}