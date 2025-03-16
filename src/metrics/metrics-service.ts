import { RedisClient } from './redis-client';

export class MetricsService {
  constructor(private redisClient: RedisClient) {}
  
  private getBucketKey(granularity: 'minute' | 'hour' | 'day'): string {
    const now = new Date();
    
    switch (granularity) {
      case 'minute':
        return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
      case 'hour':
        return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}-${now.getHours()}`;
      case 'day':
        return `${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    }
  }

  async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
    const pipeline = this.redisClient.pipeline();
    
    // Define TTLs for different granularities
    const ttls = {
      'minute': 60 * 60,         // 1 hour retention for minute granularity
      'hour': 24 * 60 * 60,      // 1 day retention for hour granularity
      'day': 30 * 24 * 60 * 60   // 30 days retention for day granularity
    };
    
    // Increment tenant-specific metrics across granularities
    for (const [granularity, ttl] of Object.entries(ttls)) {
      const bucket = this.getBucketKey(granularity as any);
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
  
  async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
    const minute = this.getBucketKey('minute');
    const key = `latency:${minute}:${metricName}:${tenantId}`;
    
    // Store with sorted set for percentile calculations
    await this.redisClient.zadd(key, latencyMs, `${Date.now()}-${Math.random()}`);
    await this.redisClient.expire(key, 60 * 60); // 1 hour TTL
    
    // Update running averages
    const pipeline = this.redisClient.pipeline();
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
      const bucket = `${windowDate.getFullYear()}-${windowDate.getMonth()+1}-${windowDate.getDate()}-${windowDate.getHours()}-${windowDate.getMinutes()}`;
      keys.push(`latency:${bucket}:${metricName}:${tenantId}`);
    }
    
    if (keys.length === 0) return 0;
    
    // Create a temporary union of all time buckets
    const tempKey = `temp:percentile:${tenantId}:${metricName}:${Date.now()}`;
    if (keys.length > 0) {
      await this.redisClient.zunionstore(tempKey, keys.length, ...keys);
      await this.redisClient.expire(tempKey, 60); // Short TTL
      
      const count = await this.redisClient.zcard(tempKey);
      if (count === 0) return 0;
      
      const index = Math.ceil((percentile / 100) * count) - 1;
      const result = await this.redisClient.zrange(tempKey, index, index, 'WITHSCORES');
      
      return result.length >= 2 ? parseFloat(result[1]) : 0;
    }
    
    return 0;
  }
}