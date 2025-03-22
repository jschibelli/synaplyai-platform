import { Redis } from 'ioredis';
import { RedisStore } from './redis-store';
import { MetricsCollector } from './metrics-collector';
import { EventEmitter } from 'events';
import { createHash } from 'crypto';

export class RedisClient {
  private redis: Redis;

  constructor(redisUrl?: string) {
    this.redis = new Redis(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379');
  }

  async get(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    return await this.redis.hget(key, field);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redis.hset(key, field, value);
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    return await this.redis.hincrby(key, field, increment);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async zadd(key: string, score: number, member: string): Promise<number> {
    return await this.redis.zadd(key, score, member);
  }

  async zrange(key: string, start: number, stop: number, withScores?: 'WITHSCORES'): Promise<string[]> {
    return await this.redis.zrange(key, start, stop, withScores);
  }

  async zcard(key: string): Promise<number> {
    return await this.redis.zcard(key);
  }

  async zunionstore(destination: string, numKeys: number, ...keys: string[]): Promise<number> {
    return await this.redis.zunionstore(destination, numKeys, ...keys);
  }

  pipeline(): any {
    return this.redis.pipeline();
  }

  async del(key: string): Promise<number> {
    return await this.redis.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }
}

export class RedisMetricsClient {
  constructor(private redis: Redis) {}
  
  private getBucketKey(granularity: 'minute' | 'hour' | 'day'): string {
    const now = new Date();
    
    switch (granularity) {
      case 'minute':
        return `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}-${now.getMinutes().toString().padStart(2, '0')}`;
      case 'hour':
        return `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}-${now.getHours().toString().padStart(2, '0')}`;
      case 'day':
      default:
        return `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
    }
  }
  
  // Get a specific bucket key for a given timestamp
  private getSpecificBucketKey(timestamp: Date, granularity: 'minute' | 'hour' | 'day'): string {
    switch (granularity) {
      case 'minute':
        return `${timestamp.getFullYear()}-${(timestamp.getMonth()+1).toString().padStart(2, '0')}-${timestamp.getDate().toString().padStart(2, '0')}-${timestamp.getHours().toString().padStart(2, '0')}-${timestamp.getMinutes().toString().padStart(2, '0')}`;
      case 'hour':
        return `${timestamp.getFullYear()}-${(timestamp.getMonth()+1).toString().padStart(2, '0')}-${timestamp.getDate().toString().padStart(2, '0')}-${timestamp.getHours().toString().padStart(2, '0')}`;
      case 'day':
      default:
        return `${timestamp.getFullYear()}-${(timestamp.getMonth()+1).toString().padStart(2, '0')}-${timestamp.getDate().toString().padStart(2, '0')}`;
    }
  }

  async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    // Define TTLs for different granularities
    const ttls = {
      minute: 60 * 60,         // 1 hour retention for minute granularity
      hour: 24 * 60 * 60,      // 1 day retention for hour granularity
      day: 30 * 24 * 60 * 60   // 30 days retention for day granularity
    };
    
    // Increment tenant-specific metrics across granularities
    const granularities: Array<keyof typeof ttls> = ['minute', 'hour', 'day'];
    for (const granularity of granularities) {
      const bucket = this.getBucketKey(granularity);
      const key = `metrics:${granularity}:${bucket}:tenant:${tenantId}`;
      
      pipeline.hincrby(key, metricName, value);
      pipeline.expire(key, ttls[granularity]);
      
      // Also increment global counters
      const globalKey = `metrics:${granularity}:${bucket}:global`;
      pipeline.hincrby(globalKey, metricName, value);
      pipeline.expire(globalKey, ttls[granularity]);
    }
    
    await pipeline.exec();
  }
  
  async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
    const minute = this.getBucketKey('minute');
    const key = `latency:${minute}:${metricName}:${tenantId}`;
    
    // Store with sorted set for percentile calculations
    await this.redis.zadd(key, latencyMs, `${Date.now()}-${Math.random()}`);
    await this.redis.expire(key, 60 * 60); // 1 hour TTL
    
    // Update running averages
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(`latency:avg:${tenantId}`, `${metricName}:count`, 1);
    pipeline.hincrbyfloat(`latency:avg:${tenantId}`, `${metricName}:sum`, latencyMs);
    await pipeline.exec();
  }
  
  async getPercentileLatency(
    metricName: string, 
    tenantId: string, 
    percentile: number, 
    timeWindowMinutes = 5
  ): Promise<number> {
    const keys = [];
    const now = new Date();
    
    // Gather keys for the specified time window
    for (let i = 0; i < timeWindowMinutes; i++) {
      const windowDate = new Date(now);
      windowDate.setMinutes(now.getMinutes() - i);
      const bucket = this.getSpecificBucketKey(windowDate, 'minute');
      keys.push(`latency:${bucket}:${metricName}:${tenantId}`);
    }
    
    if (keys.length === 0) return 0;
    
    // Create a temporary union of all time buckets
    const tempKey = `temp:percentile:${tenantId}:${metricName}:${Date.now()}`;
    
    try {
      // Check if any of the keys exist
      let keysExist = false;
      for (const key of keys) {
        if (await this.redis.exists(key)) {
          keysExist = true;
          break;
        }
      }
      
      if (!keysExist) return 0;
      
      await this.redis.zunionstore(tempKey, keys.length, ...keys);
      await this.redis.expire(tempKey, 60); // Short TTL
      
      const count = await this.redis.zcard(tempKey);
      if (count === 0) return 0;
      
      const index = Math.ceil((percentile / 100) * count) - 1;
      const result = await this.redis.zrange(tempKey, index, index, 'WITHSCORES');
      
      return result.length >= 2 ? parseFloat(result[1]) : 0;
    } catch (error) {
      console.error('Error calculating percentile latency:', error);
      return 0;
    } finally {
      // Clean up temp key
      await this.redis.del(tempKey);
    }
  }
  
  async getAverageLatency(metricName: string, tenantId: string): Promise<number> {
    const count = await this.redis.hget(`latency:avg:${tenantId}`, `${metricName}:count`);
    const sum = await this.redis.hget(`latency:avg:${tenantId}`, `${metricName}:sum`);
    
    if (!count || !sum) return 0;
    
    return parseFloat(sum) / parseInt(count, 10);
  }
  
  async getMetricCounts(
    metricName: string, 
    tenantId: string, 
    granularity: 'minute' | 'hour' | 'day' = 'hour',
    limit: number = 24
  ): Promise<{timestamp: string; value: number}[]> {
    const result: {timestamp: string; value: number}[] = [];
    const now = new Date();
    
    for (let i = 0; i < limit; i++) {
      const offset = new Date(now);
      switch (granularity) {
        case 'minute':
          offset.setMinutes(now.getMinutes() - i);
          break;
        case 'hour':
          offset.setHours(now.getHours() - i);
          break;
        case 'day':
          offset.setDate(now.getDate() - i);
          break;
      }
      
      const bucket = this.getSpecificBucketKey(offset, granularity);
      const key = `metrics:${granularity}:${bucket}:tenant:${tenantId}`;
      const value = await this.redis.hget(key, metricName);
      
      result.push({
        timestamp: bucket,
        value: value ? parseInt(value, 10) : 0
      });
    }
    
    // Return in chronological order
    return result.reverse();
  }
}

export enum BreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface BreakerConfig {
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  halfOpenAttempts: number;
}

export class TenantAwareCircuitBreaker {
  private defaultConfig: BreakerConfig = {
    failureThreshold: 5,
    resetTimeout: 30000, // 30 seconds
    halfOpenAttempts: 3
  };
  private eventEmitter: EventEmitter;
  private tenantConfigs: Map<string, BreakerConfig>;

  constructor(
    private redisStore: RedisStore,
    private metrics: MetricsCollector,
    tenantConfigs?: Map<string, BreakerConfig>
  ) {
    this.tenantConfigs = tenantConfigs || new Map();
    this.eventEmitter = new EventEmitter();
  }

  getConfig(tenantId: string): BreakerConfig {
    return this.tenantConfigs.get(tenantId) || this.defaultConfig;
  }

  async isAllowed(tenantId: string, service: string): Promise<boolean> {
    const state = await this.redisStore.getState(tenantId, service);
    
    // Track check in metrics
    await this.metrics.increment(`circuit.check.${service}.${state}`, tenantId);
    
    switch (state) {
      case BreakerState.CLOSED:
        return true;
      case BreakerState.OPEN:
        return false;
      case BreakerState.HALF_OPEN:
        // In half-open state, we allow limited traffic
        const attempts = await this.redisStore.getCurrentAttempts(tenantId, service);
        const config = this.getConfig(tenantId);
        if (attempts < config.halfOpenAttempts) {
          await this.redisStore.incrementAttempts(tenantId, service);
          return true;
        }
        return false;
      default:
        return true;
    }
  }

  async registerSuccess(tenantId: string, service: string): Promise<void> {
    const state = await this.redisStore.getState(tenantId, service);
    await this.metrics.increment(`circuit.success.${service}`, tenantId);
    
    if (state === BreakerState.HALF_OPEN) {
      const successes = await this.redisStore.incrementSuccess(tenantId, service);
      const config = this.getConfig(tenantId);
      
      if (successes >= config.halfOpenAttempts) {
        await this.transitionState(tenantId, service, BreakerState.CLOSED);
        await this.redisStore.resetCounters(tenantId, service);
      }
    }
  }

  async registerFailure(tenantId: string, service: string): Promise<void> {
    const state = await this.redisStore.getState(tenantId, service);
    await this.metrics.increment(`circuit.failure.${service}`, tenantId);
    
    if (state === BreakerState.CLOSED) {
      const failures = await this.redisStore.incrementFailure(tenantId, service);
      const config = this.getConfig(tenantId);
      
      if (failures >= config.failureThreshold) {
        await this.transitionState(tenantId, service, BreakerState.OPEN);
        
        // Schedule reset to half-open
        setTimeout(async () => {
          const currentState = await this.redisStore.getState(tenantId, service);
          if (currentState === BreakerState.OPEN) {
            await this.transitionState(tenantId, service, BreakerState.HALF_OPEN);
            await this.redisStore.resetAttempts(tenantId, service);
          }
        }, this.getConfig(tenantId).resetTimeout);
      }
    } else if (state === BreakerState.HALF_OPEN) {
      // Immediate trip back to open on failure during half-open state
      await this.transitionState(tenantId, service, BreakerState.OPEN);
    }
  }

  // Execute a function with circuit breaker protection
  async execute<T>(tenantId: string, service: string, fn: () => Promise<T>): Promise<T> {
    if (!(await this.isAllowed(tenantId, service))) {
      throw new Error(`Circuit breaker for ${service} is open for tenant ${tenantId}`);
    }
    
    try {
      const result = await fn();
      await this.registerSuccess(tenantId, service);
      return result;
    } catch (error) {
      await this.registerFailure(tenantId, service);
      throw error;
    }
  }

  private async transitionState(tenantId: string, service: string, newState: BreakerState): Promise<void> {
    const prevState = await this.redisStore.getState(tenantId, service);
    await this.redisStore.setState(tenantId, service, newState);
    
    // Track state transitions for dashboard visibility
    await this.metrics.increment(`circuit.transition.${prevState}-to-${newState}`, tenantId);
    
    // Emit event for real-time dashboard updates
    this.eventEmitter.emit('circuit-state-change', {
      tenantId,
      service,
      prevState,
      newState,
      timestamp: Date.now()
    });
  }

  // Subscribe to state change events
  onStateChange(listener: (event: any) => void): void {
    this.eventEmitter.on('circuit-state-change', listener);
  }

  // Unsubscribe from state change events
  offStateChange(listener: (event: any) => void): void {
    this.eventEmitter.off('circuit-state-change', listener);
  }
}

export class ShardedRedisClient {
  private redisClients: Redis[];
  private shardCount: number;
  
  constructor(redisUrls: string[]) {
    if (!redisUrls || redisUrls.length === 0) {
      throw new Error('At least one Redis URL must be provided');
    }
    
    this.redisClients = redisUrls.map(url => new Redis(url));
    this.shardCount = redisUrls.length;
  }
  
  /**
   * Gets the appropriate Redis client shard for a given tenant ID
   */
  private getShardForTenant(tenantId: string): Redis {
    const hash = createHash('md5').update(tenantId).digest('hex');
    const shardIndex = parseInt(hash.substring(0, 8), 16) % this.shardCount;
    return this.redisClients[shardIndex];
  }
  
  /**
   * Gets the appropriate Redis client for a key based on consistent hashing
   */
  private getShardForKey(key: string): Redis {
    const hash = createHash('md5').update(key).digest('hex');
    const shardIndex = parseInt(hash.substring(0, 8), 16) % this.shardCount;
    return this.redisClients[shardIndex];
  }
  
  /**
   * Increment a counter in Redis with TTL-based expiry
   */
  async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
    const client = this.getShardForTenant(tenantId);
    
    // Define TTLs for different granularities
    const ttls = {
      minute: 60 * 60,        // 1 hour retention for minute granularity
      hour: 24 * 60 * 60,     // 1 day retention for hour granularity
      day: 30 * 24 * 60 * 60  // 30 days retention for day granularity
    };
    
    const pipeline = client.pipeline();
    const now = new Date();
    
    // Increment tenant-specific metrics across granularities
    for (const [granularity, ttl] of Object.entries(ttls)) {
      let bucket: string;
      
      switch (granularity) {
        case 'minute':
          bucket = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
          break;
        case 'hour':
          bucket = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}`;
          break;
        case 'day':
          bucket = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
          break;
        default:
          bucket = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
      }
      
      const key = `metrics:${granularity}:${bucket}:tenant:${tenantId}`;
      
      pipeline.hincrby(key, metricName, value);
      pipeline.expire(key, ttl);
      
      // Also increment global counters
      const globalKey = `metrics:${granularity}:${bucket}:global`;
      pipeline.hincrby(globalKey, metricName, value);
      pipeline.expire(globalKey, ttl);
    }
    
    await pipeline.exec();
  }
  
  /**
   * Record a latency value for percentile calculations
   */
  async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
    const client = this.getShardForTenant(tenantId);
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    
    const key = `latency:${tenantId}:${metricName}:${minute}`;
    
    // Store with sorted set for percentile calculations
    await client.pipeline()
      .zadd(key, latencyMs, `${now}-${Math.random()}`)
      .expire(key, 3600) // 1 hour TTL
      .exec();
  }
  
  /**
   * Get a percentile latency value
   */
  async getPercentileLatency(
    metricName: string,
    tenantId: string,
    percentile: number,
    timeWindowMinutes = 5
  ): Promise<number | null> {
    const client = this.getShardForTenant(tenantId);
    const now = Date.now();
    const currentMinute = Math.floor(now / 60000);
    
    // Calculate the temporary destination key for the union operation
    const destinationKey = `tmp:percentile:${tenantId}:${metricName}:${now}`;
    
    // Create an array of keys for the time window
    const keys: string[] = [];
    for (let i = 0; i < timeWindowMinutes; i++) {
      keys.push(`latency:${tenantId}:${metricName}:${currentMinute - i}`);
    }
    
    if (keys.length === 0) {
      return null;
    }
    
    try {
      // Union all the sorted sets for the time window
      await client.zunionstore(
        destinationKey,
        keys.length,
        ...keys,
        'AGGREGATE',
        'MAX'
      );
      
      // Set a short TTL for the temporary key
      await client.expire(destinationKey, 60);
      
      // Get the total count of elements
      const count = await client.zcard(destinationKey);
      
      if (count === 0) {
        return null;
      }
      
      // Calculate the index for the percentile
      const index = Math.ceil(count * (percentile / 100)) - 1;
      
      // Get the value at the percentile index
      const result = await client.zrange(
        destinationKey,
        index,
        index,
        'WITHSCORES'
      );
      
      if (result.length >= 2) {
        return parseFloat(result[1]);
      }
      
      return null;
    } finally {
      // Clean up the temporary key
      await client.del(destinationKey);
    }
  }

  /**
   * Get metrics for a specific tenant and time period
   */
  async getMetrics(
    tenantId: string, 
    metricNames: string[], 
    granularity: 'minute' | 'hour' | 'day' = 'hour',
    timeRange: { start: Date; end: Date }
  ): Promise<Record<string, number[]>> {
    const client = this.getShardForTenant(tenantId);
    const result: Record<string, number[]> = {};
    
    // Initialize result with empty arrays
    for (const metricName of metricNames) {
      result[metricName] = [];
    }
    
    // Generate bucket keys for the time range
    const buckets: string[] = [];
    let current = new Date(timeRange.start);
    
    while (current <= timeRange.end) {
      let bucket: string;
      
      switch (granularity) {
        case 'minute':
          bucket = `${current.getFullYear()}-${current.getMonth()+1}-${current.getDate()}-${current.getHours()}-${current.getMinutes()}`;
          current = new Date(current.getTime() + 60000); // Add 1 minute
          break;
        case 'hour':
          bucket = `${current.getFullYear()}-${current.getMonth()+1}-${current.getDate()}-${current.getHours()}`;
          current = new Date(current.getTime() + 3600000); // Add 1 hour
          break;
        case 'day':
          bucket = `${current.getFullYear()}-${current.getMonth()+1}-${current.getDate()}`;
          current = new Date(current.getTime() + 86400000); // Add 1 day
          break;
      }
      
      buckets.push(bucket);
    }
    
    // Fetch metrics for each bucket
    for (const bucket of buckets) {
      const key = `metrics:${granularity}:${bucket}:tenant:${tenantId}`;
      
      // Get all metrics for this bucket
      const values = await client.hgetall(key);
      
      // Add values to result arrays, using 0 for missing values
      for (const metricName of metricNames) {
        const value = values[metricName] ? parseInt(values[metricName], 10) : 0;
        result[metricName].push(value);
      }
    }
    
    return result;
  }
  
  /**
   * Close all Redis connections
   */
  async close(): Promise<void> {
    await Promise.all(this.redisClients.map(client => client.disconnect()));
  }
}