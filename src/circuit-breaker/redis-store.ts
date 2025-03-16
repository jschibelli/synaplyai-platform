import { Redis } from 'ioredis';
import { BreakerState } from './tenant-breaker';

export class RedisStore {
  private readonly TTL = 24 * 60 * 60; // 24 hours in seconds
  
  constructor(private redis: Redis) {}
  
  async getState(tenantId: string, service: string): Promise<BreakerState> {
    const state = await this.redis.get(`circuit:${tenantId}:${service}:state`);
    return (state as BreakerState) || BreakerState.CLOSED;
  }
  
  async setState(tenantId: string, service: string, state: BreakerState): Promise<void> {
    await this.redis.set(`circuit:${tenantId}:${service}:state`, state, 'EX', this.TTL);
  }
  
  async incrementFailure(tenantId: string, service: string): Promise<number> {
    const result = await this.redis.hincrby(`circuit:${tenantId}:${service}:counters`, 'failures', 1);
    await this.redis.expire(`circuit:${tenantId}:${service}:counters`, this.TTL);
    return result;
  }
  
  async incrementSuccess(tenantId: string, service: string): Promise<number> {
    const result = await this.redis.hincrby(`circuit:${tenantId}:${service}:counters`, 'successes', 1);
    await this.redis.expire(`circuit:${tenantId}:${service}:counters`, this.TTL);
    return result;
  }
  
  async getCurrentAttempts(tenantId: string, service: string): Promise<number> {
    const attempts = await this.redis.hget(`circuit:${tenantId}:${service}:counters`, 'attempts');
    return attempts ? parseInt(attempts, 10) : 0;
  }
  
  async incrementAttempts(tenantId: string, service: string): Promise<number> {
    const result = await this.redis.hincrby(`circuit:${tenantId}:${service}:counters`, 'attempts', 1);
    await this.redis.expire(`circuit:${tenantId}:${service}:counters`, this.TTL);
    return result;
  }
  
  async resetCounters(tenantId: string, service: string): Promise<void> {
    await this.redis.del(`circuit:${tenantId}:${service}:counters`);
  }
  
  async resetAttempts(tenantId: string, service: string): Promise<void> {
    await this.redis.hset(`circuit:${tenantId}:${service}:counters`, 'attempts', '0');
  }
}