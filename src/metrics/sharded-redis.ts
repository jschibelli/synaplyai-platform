import { createHash } from 'crypto';
import { Redis } from 'ioredis';

/**
 * Client that distributes Redis operations across multiple shards based on tenant ID.
 * Provides consistent sharding and TTL-based metrics storage with roll-ups.
 */
export class ShardedRedisClient {
  private redisClients: Redis[];
  private shardCount: number;
  
  /**
   * Creates a sharded Redis client using multiple Redis connections
   * @param redisUrls Array of Redis connection URLs for different shards
   */
  constructor(redisUrls: string[]) {
    if (!redisUrls || redisUrls.length === 0) {
      throw new Error('At least one Redis URL must be provided for ShardedRedisClient');
    }
    
    this.shardCount = redisUrls.length;
    this.redisClients = redisUrls.map(url => new Redis(url));
  }
  
  /**
   * Get the appropriate Redis client for a tenant based on consistent hashing
   */
  getShardForTenant(tenantId: string): Redis {
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
   * Increment a counter for the specified tenant and key
   */
  async increment(tenantId: string, key: string, amount: number = 1): Promise<number> {
    const shard = this.getShardForTenant(tenantId);
    const tenantKey = `metrics:${tenantId}:${key}`;
    const result = await shard.incrby(tenantKey, amount);
    await shard.expire(tenantKey, 86400); // 24 hour default TTL
    return result;
  }
  
  /**
   * Store a value in a time-bucketed format with TTL
   */
  async storeBucketedValue(tenantId: string, key: string, value: number, granularity: 'minute' | 'hour' | 'day'): Promise<void> {
    const shard = this.getShardForTenant(tenantId);
    const now = new Date();
    
    let bucketKey: string;
    let ttl: number;
    
    switch (granularity) {
      case 'minute':
        bucketKey = `metrics:${tenantId}:${key}:${now.toISOString().slice(0, 16)}`;
        ttl = 60 * 60; // 1 hour TTL for minute-level data
        break;
      case 'hour':
        bucketKey = `metrics:${tenantId}:${key}:${now.toISOString().slice(0, 13)}`;
        ttl = 24 * 60 * 60; // 24 hours TTL for hour-level data
        break;
      case 'day':
        bucketKey = `metrics:${tenantId}:${key}:${now.toISOString().slice(0, 10)}`;
        ttl = 30 * 24 * 60 * 60; // 30 days TTL for day-level data
        break;
      default:
        throw new Error(`Invalid granularity: ${granularity}`);
    }
    
    await shard.incrby(bucketKey, value);
    await shard.expire(bucketKey, ttl);
    
    // Also store in a global bucket across tenants
    const globalBucketKey = `metrics:global:${key}:${now.toISOString().slice(0, 10)}`;
    await shard.incrby(globalBucketKey, value);
    await shard.expire(globalBucketKey, ttl);
  }
  
  /**
   * Add a value to a time series with roll-ups
   */
  async recordTimeSeriesValue(tenantId: string, key: string, value: number): Promise<void> {
    const shard = this.getShardForTenant(tenantId);
    const now = new Date();
    const timestamp = Math.floor(now.getTime() / 1000);
    
    // Store the raw value in a time series
    // For simplicity, we'll use Redis sorted sets, but a real implementation
    // might use RedisTimeSeries module
    const tsKey = `timeseries:${tenantId}:${key}`;
    await shard.zadd(tsKey, timestamp, `${value}:${timestamp}:${Math.random()}`);
    
    // Set TTL to prevent unbounded growth
    await shard.expire(tsKey, 24 * 60 * 60); // 24 hour retention for raw values
    
    // Update roll-up aggregations for this minute
    const minuteKey = `rollup:${tenantId}:${key}:${now.toISOString().slice(0, 16)}`;
    const hourKey = `rollup:${tenantId}:${key}:${now.toISOString().slice(0, 13)}`;
    const dayKey = `rollup:${tenantId}:${key}:${now.toISOString().slice(0, 10)}`;
    
    // Use pipeline for better performance
    const pipeline = shard.pipeline();
    
    // Update count, sum, min, max for roll-ups
    ['minute', 'hour', 'day'].forEach(granularity => {
      let key: string;
      let ttl: number;
      
      switch (granularity) {
        case 'minute':
          key = minuteKey;
          ttl = 60 * 60; // 1 hour
          break;
        case 'hour':
          key = hourKey;
          ttl = 24 * 60 * 60; // 24 hours
          break;
        case 'day':
          key = dayKey;
          ttl = 30 * 24 * 60 * 60; // 30 days
          break;
      }
      
      pipeline.hincrby(key, 'count', 1);
      pipeline.hincrby(key, 'sum', value);
      pipeline.hset(key, 'last_update', timestamp);
      
      // For min/max, we need to check the current value first
      pipeline.hget(key, 'min').then(min => {
        if (min === null || parseFloat(min) > value) {
          shard.hset(key, 'min', value);
        }
      });
      
      pipeline.hget(key, 'max').then(max => {
        if (max === null || parseFloat(max) < value) {
          shard.hset(key, 'max', value);
        }
      });
      
      pipeline.expire(key, ttl);
    });
    
    await pipeline.exec();
  }
  
  /**
   * Retrieve metrics for a specific tenant and time frame
   */
  async getMetrics(tenantId: string, key: string, timeFrame: 'minute' | 'hour' | 'day', count: number = 24): Promise<Array<{ timestamp: string, value: number }>> {
    const shard = this.getShardForTenant(tenantId);
    const now = new Date();
    const results = [];
    
    // Get metrics for the specified number of time periods
    for (let i = 0; i < count; i++) {
      const date = new Date(now);
      
      switch (timeFrame) {
        case 'minute':
          date.setMinutes(date.getMinutes() - i);
          break;
        case 'hour':
          date.setHours(date.getHours() - i);
          break;
        case 'day':
          date.setDate(date.getDate() - i);
          break;
      }
      
      let timePart: string;
      switch (timeFrame) {
        case 'minute':
          timePart = date.toISOString().slice(0, 16);
          break;
        case 'hour':
          timePart = date.toISOString().slice(0, 13);
          break;
        case 'day':
          timePart = date.toISOString().slice(0, 10);
          break;
      }
      
      const metricKey = `metrics:${tenantId}:${key}:${timePart}`;
      const value = await shard.get(metricKey);
      
      results.push({
        timestamp: timePart,
        value: value ? parseInt(value, 10) : 0
      });
    }
    
    return results.reverse(); // Return in chronological order
  }
  
  /**
   * Retrieve roll-up statistics for a specific tenant and time frame
   */
  async getRollupStats(tenantId: string, key: string, timeFrame: 'minute' | 'hour' | 'day'): Promise<{
    count: number;
    sum: number;
    min: number;
    max: number;
    avg: number;
  } | null> {
    const shard = this.getShardForTenant(tenantId);
    const now = new Date();
    
    let timePart: string;
    switch (timeFrame) {
      case 'minute':
        timePart = now.toISOString().slice(0, 16);
        break;
      case 'hour':
        timePart = now.toISOString().slice(0, 13);
        break;
      case 'day':
        timePart = now.toISOString().slice(0, 10);
        break;
    }
    
    const rollupKey = `rollup:${tenantId}:${key}:${timePart}`;
    
    const data = await shard.hgetall(rollupKey);
    
    if (Object.keys(data).length === 0) {
      return null;
    }
    
    const count = parseInt(data.count || '0', 10);
    const sum = parseInt(data.sum || '0', 10);
    const min = parseInt(data.min || '0', 10);
    const max = parseInt(data.max || '0', 10);
    const avg = count > 0 ? sum / count : 0;
    
    return { count, sum, min, max, avg };
  }
  
  /**
   * Get percentile latency value for a specific metric and tenant
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
   * Record a latency value
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
   * Get metrics for a specific tenant and time period
   */
  async getMetricSeries(
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
   * Increment a counter in Redis with TTL-based expiry
   */
  async incrementCounter(metricName: string, tenantId: string, value = 1): Promise<void> {
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
   * Record a value for a specific metric
   */
  async recordValue(metricName: string, value: number, tenantId: string): Promise<void> {
    // Record the raw value in a time series for statistical calculations
    await this.recordTimeSeriesValue(tenantId, metricName, value);
    
    // Also increment counters for this tenant
    await this.incrementCounter(`${metricName}.count`, tenantId);
    
    // For numeric values, we also track sum for averages
    await this.incrementCounter(`${metricName}.sum`, tenantId, value);
  }

  /**
   * Get current average value for a metric
   */
  async getAverageValue(metricName: string, tenantId: string): Promise<number | null> {
    const client = this.getShardForTenant(tenantId);
    const now = new Date();
    const dayBucket = `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    
    const countKey = `metrics:day:${dayBucket}:tenant:${tenantId}`;
    const count = await client.hget(countKey, `${metricName}.count`);
    const sum = await client.hget(countKey, `${metricName}.sum`);
    
    if (!count || !sum || parseInt(count, 10) === 0) {
      return null;
    }
    
    return parseFloat(sum) / parseInt(count, 10);
  }
  
  /**
   * Close all Redis connections
   */
  async close(): Promise<void> {
    await Promise.all(this.redisClients.map(client => client.disconnect()));
  }
}