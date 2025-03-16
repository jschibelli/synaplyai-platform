import { Redis } from 'ioredis';
import { createHash } from 'crypto';

export class ShardedRedisClient {
  private redisClients: Redis[];
  private shardCount: number;
  
  constructor(redisUrls: string[]) {
    if (redisUrls.length === 0) {
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
   * Increment a counter in Redis
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
   * Close all Redis connections
   */
  async close(): Promise<void> {
    await Promise.all(this.redisClients.map(client => client.quit()));
  }
}