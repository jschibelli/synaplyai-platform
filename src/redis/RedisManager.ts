import IORedis from 'ioredis';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * Redis key categories with different expiration policies
 */
export enum RedisKeyCategory {
  AI_CACHE = 'ai_cache',
  SESSION_STATE = 'session_state',
  VECTOR_CLOCK = 'vector_clock',
  CONFLICT_STATE = 'conflict_state',
  TENANT_SETTINGS = 'tenant_settings'
}

/**
 * Configuration for Redis key expiration policies
 */
export const redisExpirationPolicies: Record<RedisKeyCategory, { ttl: number, maxMemoryPolicy: string }> = {
  [RedisKeyCategory.AI_CACHE]: { 
    ttl: 24 * 60 * 60, // 24 hours
    maxMemoryPolicy: 'volatile-ttl' // Evict keys with TTL when memory is full
  },
  [RedisKeyCategory.SESSION_STATE]: { 
    ttl: 30 * 60, // 30 minutes
    maxMemoryPolicy: 'volatile-lru' // Least recently used
  },
  [RedisKeyCategory.VECTOR_CLOCK]: { 
    ttl: 7 * 24 * 60 * 60, // 7 days
    maxMemoryPolicy: 'allkeys-lru' // Can evict any key using LRU
  },
  [RedisKeyCategory.CONFLICT_STATE]: { 
    ttl: 24 * 60 * 60, // 24 hours
    maxMemoryPolicy: 'volatile-ttl' // Evict keys with TTL when memory is full
  },
  [RedisKeyCategory.TENANT_SETTINGS]: { 
    ttl: 0, // No expiration
    maxMemoryPolicy: 'noeviction' // Never evict these keys
  }
};

/**
 * Manages Redis connections with proper key expiration and circuit breaking
 */
export class RedisManager {
  private redis: IORedis.Redis;
  private circuitBreaker: CircuitBreaker;
  
  constructor(
    redisUrl: string,
    private metricsCollector: MetricsCollector
  ) {
    this.redis = new IORedis(redisUrl);
    this.circuitBreaker = new CircuitBreaker('redis', {
      failureThreshold: 3,
      resetTimeout: 10000
    });
    
    // Configure Redis client
    this.configureRedisClient();
  }
  
  /**
   * Sets a value with appropriate TTL based on category
   */
  async set(key: string, value: string, category: RedisKeyCategory): Promise<string> {
    const { ttl } = redisExpirationPolicies[category];
    
    return this.circuitBreaker.execute(async () => {
      if (ttl > 0) {
        return this.redis.set(key, value, 'EX', ttl);
      } else {
        return this.redis.set(key, value);
      }
    });
  }
  
  // Additional methods...
}