import { Redis } from 'ioredis';
import redisClient from '../../config/redis.config';

export class UsageRedisSchema {
  private redis: Redis;

  constructor() {
    this.redis = redisClient;
  }

  // Daily usage key format: usage:daily:{tenantId}:{YYYY-MM-DD}
  getDailyUsageKey(tenantId: string, date: Date): string {
    const dateStr = date.toISOString().split('T')[0];
    return `usage:daily:${tenantId}:${dateStr}`;
  }

  // Monthly usage key format: usage:monthly:{tenantId}:{YYYY-MM}
  getMonthlyUsageKey(tenantId: string, date: Date): string {
    const monthStr = date.toISOString().substring(0, 7);
    return `usage:monthly:${tenantId}:${monthStr}`;
  }

  // Event stream key format: usage-events:{tenantId}
  getEventStreamKey(tenantId: string): string {
    return `usage-events:${tenantId}`;
  }
}