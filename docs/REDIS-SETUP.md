# Redis Setup and Configuration

## Overview

Redis is a critical component in the AI Content Creation Platform architecture, used for:
* **Circuit Breaker State Management**: Storing distributed circuit breaker states with tenant isolation
* **Time-Bucketed Metrics Collection**: Efficient storage of performance and usage metrics
* **Feature Flag Configuration**: Real-time feature flag access with tenant-specific rules
* **Usage Tracking & Rate Limiting**: Tracking token usage and enforcing limits

This document provides comprehensive guidance for setting up and configuring Redis for both development and production environments.

## Local Development Setup

### Using Docker (Recommended)

The simplest way to run Redis locally is with Docker:

```bash
# Start a basic Redis instance
docker run --name redis -p 6379:6379 -d redis:7.0

# Start Redis with persistence enabled
docker run --name redis -p 6379:6379 -d redis:7.0 redis-server --appendonly yes

# To access Redis CLI
docker exec -it redis redis-cli
```

### Native Installation

#### macOS

```bash
# Install via Homebrew
brew install redis

# Start the service
brew services start redis

# Verify installation
redis-cli ping
# Should return: PONG
```

#### Ubuntu/Debian

```bash
# Install Redis server
sudo apt update
sudo apt install redis-server

# Configure Redis to start on boot
sudo systemctl enable redis-server

# Start Redis
sudo systemctl start redis-server

# Check status
sudo systemctl status redis-server
```

#### Windows

Redis is not officially supported on Windows. We recommend:

1. Using WSL2 (Windows Subsystem for Linux)
2. Using Docker Desktop for Windows
3. Using the unofficial Redis port: Microsoft/Redis

## Project Configuration

### Basic Setup

1. Install the Redis client library:

```bash
npm install ioredis
```

2. Configure environment variables in your .env file:

```
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_secure_password

# Redis TTL Configuration
METRICS_TTL_MINUTES=60  # 1 hour for minute-level metrics
METRICS_TTL_HOURS=24    # 24 hours for hour-level metrics
METRICS_TTL_DAYS=30     # 30 days for day-level metrics
CIRCUIT_BREAKER_TTL=3600  # 1 hour for circuit breakers
```

3. Create Redis client instance:

```javascript
import Redis from 'ioredis';

const redisClient = new Redis(process.env.REDIS_URL, {
  password: process.env.REDIS_PASSWORD,
  enableReadyCheck: true,
  maxRetriesPerRequest: 3
});

redisClient.on('error', (err) => {
  console.error('Redis connection error:', err);
});

export default redisClient;
```

## Component-Specific Redis Usage

### 1. Circuit Breaker State

The circuit breaker pattern uses Redis to store state information:

```typescript
export class RedisCircuitBreakerStore implements CircuitBreakerStore {
  constructor(
    private redisUrl: string,
    private keyPrefix: string = 'circuit:'
  ) {
    this.client = new Redis(redisUrl);
  }

  async getState(serviceName: string, tenantId: string): Promise<CircuitBreakerState | null> {
    const key = this.getKey(serviceName, tenantId);
    const data = await this.client.hgetall(key);
    
    if (!data || Object.keys(data).length === 0) {
      return null;
    }
    
    return {
      state: data.state as CircuitState,
      failureCount: parseInt(data.failureCount || '0', 10),
      successCount: parseInt(data.successCount || '0', 10),
      lastFailure: data.lastFailure ? parseInt(data.lastFailure, 10) : undefined,
      lastStateChange: data.lastStateChange ? parseInt(data.lastStateChange, 10) : undefined,
    };
  }

  async setState(serviceName: string, tenantId: string, state: CircuitBreakerState): Promise<void> {
    const key = this.getKey(serviceName, tenantId);
    const pipeline = this.client.pipeline();
    
    pipeline.hset(key, 'state', state.state);
    pipeline.hset(key, 'failureCount', state.failureCount.toString());
    pipeline.hset(key, 'successCount', state.successCount.toString());
    
    if (state.lastFailure) {
      pipeline.hset(key, 'lastFailure', state.lastFailure.toString());
    }
    
    if (state.lastStateChange) {
      pipeline.hset(key, 'lastStateChange', state.lastStateChange.toString());
    }
    
    // Set TTL to ensure we don't keep stale circuit state forever
    pipeline.expire(key, parseInt(process.env.CIRCUIT_BREAKER_TTL || '3600', 10));
    
    await pipeline.exec();
  }

  private getKey(serviceName: string, tenantId: string): string {
    return `${this.keyPrefix}${tenantId}:${serviceName}`;
  }
}
```

### 2. Time-Bucketed Metrics

Redis is used for efficient storage and retrieval of time-series metrics data:

```typescript
export class MetricsCollector {
  constructor(private redisClient: ShardedRedisClient) {}

  async incrementCounter(name: string, tenantId: string, value: number = 1): Promise<void> {
    const now = new Date();
    
    // Store metrics in different time buckets (minute, hour, day)
    const minuteKey = this.getMetricKey(name, tenantId, this.getMinuteBucket(now));
    const hourKey = this.getMetricKey(name, tenantId, this.getHourBucket(now));
    const dayKey = this.getMetricKey(name, tenantId, this.getDayBucket(now));
    
    const pipeline = this.redisClient.pipeline();
    
    // Increment counts in each bucket
    pipeline.hincrby(minuteKey, 'count', value);
    pipeline.hincrby(hourKey, 'count', value);
    pipeline.hincrby(dayKey, 'count', value);
    
    // Set appropriate TTLs
    pipeline.expire(minuteKey, parseInt(process.env.METRICS_TTL_MINUTES || '60', 10) * 60);
    pipeline.expire(hourKey, parseInt(process.env.METRICS_TTL_HOURS || '24', 10) * 60 * 60);
    pipeline.expire(dayKey, parseInt(process.env.METRICS_TTL_DAYS || '30', 10) * 24 * 60 * 60);
    
    await pipeline.exec();
  }

  async recordLatency(name: string, value: number, tenantId: string): Promise<void> {
    const now = new Date();
    const minuteKey = this.getMetricKey(name, tenantId, this.getMinuteBucket(now), 'latency');
    
    // Store latency values in sorted sets for percentile calculations
    await this.redisClient.zadd(minuteKey, value, Date.now().toString());
    await this.redisClient.expire(minuteKey, parseInt(process.env.METRICS_TTL_MINUTES || '60', 10) * 60);
  }

  async getPercentileLatency(name: string, tenantId: string, percentile: number = 95): Promise<number | null> {
    const now = new Date();
    const minuteKey = this.getMetricKey(name, tenantId, this.getMinuteBucket(now), 'latency');
    
    // Get all values
    const values = await this.redisClient.zrange(minuteKey, 0, -1, 'WITHSCORES');
    
    if (!values || values.length === 0) {
      return null;
    }
    
    // Extract scores (latency values)
    const latencies = values.filter((_, i) => i % 2 === 1).map(v => parseFloat(v));
    
    // Calculate percentile
    latencies.sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * latencies.length) - 1;
    return latencies[index] || null;
  }

  private getMetricKey(name: string, tenantId: string, timestamp: string, type: string = 'counter'): string {
    return `metrics:${tenantId}:${name}:${timestamp}:${type}`;
  }

  private getMinuteBucket(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
  }

  private getHourBucket(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}-${date.getHours()}`;
  }

  private getDayBucket(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;
  }
}
```

### 3. Feature Flag Service

Redis provides fast access to feature flags with tenant-specific configurations:

```typescript
export class FeatureFlagService {
  constructor(
    private redisClient: ShardedRedisClient,
    private cacheTTLSeconds: number = 300
  ) {}

  async isEnabled(tenantId: string, flagName: string, context: Record<string, any> = {}): Promise<boolean> {
    const cacheKey = `feature-flag:${tenantId}:${flagName}`;
    const shard = this.redisClient.getShardForTenant(tenantId);
    
    // Try to get from cache first
    const cachedFlag = await shard.get(cacheKey);
    
    if (cachedFlag) {
      const flag = JSON.parse(cachedFlag);
      
      // If flag is disabled, return false immediately
      if (!flag.enabled) {
        return false;
      }
      
      // If there are conditions, evaluate them
      if (flag.conditions) {
        return this.evaluateConditions(flag.conditions, context);
      }
      
      // Otherwise, flag is enabled with no conditions
      return true;
    }
    
    // Not in cache, fetch from database
    const flag = await prisma.featureFlag.findFirst({
      where: {
        tenantId,
        name: flagName
      }
    });
    
    if (!flag) {
      return false;
    }
    
    // Cache the result
    await shard.set(cacheKey, JSON.stringify({
      enabled: flag.enabled,
      conditions: flag.conditions ? JSON.parse(flag.conditions as string) : null
    }), { EX: this.cacheTTLSeconds });
    
    if (!flag.enabled) {
      return false;
    }
    
    if (flag.conditions) {
      const conditions = JSON.parse(flag.conditions as string);
      return this.evaluateConditions(conditions, context);
    }
    
    return true;
  }
  
  private evaluateConditions(conditions: Record<string, any>, context: Record<string, any>): boolean {
    // Condition evaluation logic here
    // ...
    return true;
  }
}
```

### 4. Usage Tracking

Redis is used to track and limit API usage:

```typescript
export class UsageTracker {
  constructor(private redisClient: ShardedRedisClient) {}

  async trackTokenUsage(tenantId: string, userId: string, modelId: string, tokens: number): Promise<void> {
    const now = new Date();
    const monthKey = `usage:${tenantId}:${userId}:${modelId}:${now.getFullYear()}-${now.getMonth()+1}`;
    const dayKey = `usage:${tenantId}:${userId}:${modelId}:${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    
    const shard = this.redisClient.getShardForTenant(tenantId);
    const pipeline = shard.pipeline();
    
    // Increment monthly and daily usage
    pipeline.incrby(monthKey, tokens);
    pipeline.incrby(dayKey, tokens);
    
    // Set expiry for keys
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const secondsLeftInMonth = (daysInMonth - now.getDate()) * 24 * 60 * 60;
    const secondsLeftInDay = (24 - now.getHours()) * 60 * 60;
    
    pipeline.expire(monthKey, secondsLeftInMonth);
    pipeline.expire(dayKey, secondsLeftInDay);
    
    await pipeline.exec();
  }

  async getCurrentUsage(tenantId: string, userId: string, modelId: string): Promise<{ daily: number; monthly: number }> {
    const now = new Date();
    const monthKey = `usage:${tenantId}:${userId}:${modelId}:${now.getFullYear()}-${now.getMonth()+1}`;
    const dayKey = `usage:${tenantId}:${userId}:${modelId}:${now.getFullYear()}-${now.getMonth()+1}-${now.getDate()}`;
    
    const shard = this.redisClient.getShardForTenant(tenantId);
    
    // Get current usage
    const [monthlyUsage, dailyUsage] = await Promise.all([
      shard.get(monthKey),
      shard.get(dayKey)
    ]);
    
    return {
      daily: parseInt(dailyUsage || '0', 10),
      monthly: parseInt(monthlyUsage || '0', 10)
    };
  }

  async checkAllowance(tenantId: string, userId: string, modelId: string, estimatedTokens: number): Promise<boolean> {
    // Get user's limit from subscription
    const user = await prisma.user.findUnique({ 
      where: { id: userId },
      include: { subscription: true }
    });
    
    if (!user) {
      return false;
    }
    
    const limit = user.usageLimit || (user.subscription?.tokenLimit ?? 50000);
    
    // Get current usage
    const usage = await this.getCurrentUsage(tenantId, userId, modelId);
    
    // Check if adding the estimated tokens would exceed the limit
    return (usage.monthly + estimatedTokens) <= limit;
  }
}
```

## Redis Sharding Implementation

For high-volume applications, we use a custom sharding approach to distribute data across multiple Redis instances:

```typescript
export class ShardedRedisClient {
  private clients: Redis[];
  
  constructor(urls: string[]) {
    this.clients = urls.map(url => new Redis(url));
  }
  
  getShardForTenant(tenantId: string): Redis {
    // Simple hash-based sharding
    const hash = this.hashString(tenantId);
    const index = hash % this.clients.length;
    return this.clients[index];
  }
  
  getShardForKey(key: string): Redis {
    const hash = this.hashString(key);
    const index = hash % this.clients.length;
    return this.clients[index];
  }
  
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
  
  // Convenience methods that determine shard based on key
  async get(key: string): Promise<string | null> {
    const shard = this.getShardForKey(key);
    return shard.get(key);
  }
  
  async set(key: string, value: string, options?: { EX?: number }): Promise<string> {
    const shard = this.getShardForKey(key);
    if (options?.EX) {
      return shard.set(key, value, 'EX', options.EX);
    }
    return shard.set(key, value);
  }
  
  async del(key: string): Promise<number> {
    const shard = this.getShardForKey(key);
    return shard.del(key);
  }
  
  // More methods as needed...
  
  pipeline(): any {
    // Return a pipeline for the first client - not ideal, but works for certain ops
    return this.clients[0].pipeline();
  }
}
```

## Production Deployment

### Redis Cluster Configuration

For production environments with high traffic, we recommend setting up a Redis cluster:

```bash
# Create a 3-node cluster with replicas
redis-cli --cluster create \
  192.168.1.101:6379 \
  192.168.1.102:6379 \
  192.168.1.103:6379 \
  192.168.1.104:6379 \
  192.168.1.105:6379 \
  192.168.1.106:6379 \
  --cluster-replicas 1
```

### Client Configuration for Cluster

```javascript
import Redis from 'ioredis';

const cluster = new Redis.Cluster([
  { host: process.env.REDIS_NODE_1_HOST, port: parseInt(process.env.REDIS_NODE_1_PORT || '6379') },
  { host: process.env.REDIS_NODE_2_HOST, port: parseInt(process.env.REDIS_NODE_2_PORT || '6379') },
  { host: process.env.REDIS_NODE_3_HOST, port: parseInt(process.env.REDIS_NODE_3_PORT || '6379') }
], {
  redisOptions: {
    password: process.env.REDIS_PASSWORD,
    tls: process.env.REDIS_TLS_ENABLED === 'true' ? {} : undefined
  },
  scaleReads: 'slave', // Read from replicas
  maxRedirections: 16,
  retryDelayOnFailover: 300
});
```

## Memory Management

### Key Expiration Strategies

All Redis keys should have appropriate TTLs to prevent memory leaks:

```typescript
// TTL mapping by key prefix
const TTL_MAPPING = {
  'metrics:minute:': 60 * 60,         // 1 hour for minute-level metrics
  'metrics:hour:': 24 * 60 * 60,      // 24 hours for hour-level metrics
  'metrics:day:': 30 * 24 * 60 * 60,  // 30 days for day-level metrics
  'circuit:': 60 * 60,                // 1 hour for circuit breakers
  'feature-flag:': 5 * 60,            // 5 minutes for feature flags
  'usage:daily:': 48 * 60 * 60,       // 48 hours for daily usage
  'usage:monthly:': 35 * 24 * 60 * 60 // 35 days for monthly usage
};

// Apply TTL based on key prefix
function applyAppropriateExpiry(key: string, value: any, redis: Redis): void {
  for (const [prefix, ttl] of Object.entries(TTL_MAPPING)) {
    if (key.startsWith(prefix)) {
      redis.expire(key, ttl);
      break;
    }
  }
}
```

### Redis Configuration

For production, configure Redis with appropriate memory limits:

```
# /etc/redis/redis.conf
maxmemory 2gb
maxmemory-policy volatile-lru
```

## Monitoring

### Health Check Implementation

```typescript
export async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  latencyMs: number;
  details?: string;
}> {
  const startTime = Date.now();
  
  try {
    // Perform a simple ping
    await redisClient.ping();
    
    // Get basic stats
    const info = await redisClient.info();
    const usedMemory = /used_memory_human:(\S+)/.exec(info)?.[1];
    const connectedClients = /connected_clients:(\S+)/.exec(info)?.[1];
    
    return {
      status: 'healthy',
      latencyMs: Date.now() - startTime,
      details: `Memory: ${usedMemory}, Clients: ${connectedClients}`
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - startTime,
      details: (error as Error).message
    };
  }
}
```

### Prometheus Integration

For production monitoring, export Redis metrics to Prometheus:

```bash
# Install redis_exporter
docker run --name redis_exporter -d \
  -p 9121:9121 \
  -e REDIS_ADDR=redis://redis:6379 \
  -e REDIS_PASSWORD=your_password \
  oliver006/redis_exporter
```

## Troubleshooting

### Common Issues and Solutions

1. **Connection Refused**
   * Check Redis is running: `redis-cli ping`
   * Verify network settings: `netstat -an | grep 6379`
   * Check firewall rules: `sudo ufw status`

2. **Out of Memory**
   * Examine memory usage: `redis-cli info memory`
   * Look for keys without TTL: `redis-cli --scan --pattern '*' | xargs redis-cli ttl`
   * Consider increasing `maxmemory` or changing policy

3. **Slow Responses**
   * Check slow log: `redis-cli slowlog get 10`
   * Monitor commands: `redis-cli monitor` (use briefly in production)
   * Look for large keys: `redis-cli --bigkeys`

4. **Cluster Issues**
   * Check cluster status: `redis-cli cluster nodes`
   * Check cluster info: `redis-cli cluster info`

## Best Practices

1. **Always set TTL values** for all keys to prevent memory leaks
2. **Use pipelining** for multiple operations to reduce network round trips
3. **Implement retry logic** for operations on Redis to handle temporary failures
4. **Monitor memory usage** continuously to avoid OOM errors
5. **Use proper naming conventions** for keys to make troubleshooting easier
6. **Consider sharding** for high-volume applications
7. **Enable persistence** (AOF or RDB) in production environments
8. **Implement proper error handling** for Redis operations

## References

* Redis Official Documentation
* Redis Best Practices
* IoRedis Documentation
* Redis Cluster Tutorial