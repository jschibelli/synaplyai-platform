// src/features/tenant-flags.ts
import { Redis } from 'ioredis';

export class TenantFeatureFlags {
  private redis: Redis;
  
  constructor(redis: Redis) {
    this.redis = redis;
  }

  async isEnabled(tenantId: string, flag: string): Promise<boolean> {
    const value = await this.redis.hget(`tenant:${tenantId}:flags`, flag);
    return value === 'true';
  }

  async setFlag(tenantId: string, flag: string, enabled: boolean): Promise<void> {
    await this.redis.hset(
      `tenant:${tenantId}:flags`, 
      flag, 
      enabled.toString()
    );
  }

  async getEnabledFlags(tenantId: string): Promise<string[]> {
    const flags = await this.redis.hgetall(`tenant:${tenantId}:flags`);
    return Object.entries(flags)
      .filter(([_, value]) => value === 'true')
      .map(([flag]) => flag);
  }
}