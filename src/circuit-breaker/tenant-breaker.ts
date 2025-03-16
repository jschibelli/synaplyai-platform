import { Redis } from 'ioredis';
import { RedisStore } from './redis-store';
import { EventEmitter } from 'events';

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
    private metrics?: any,
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
    if (this.metrics) {
      await this.metrics.increment(`circuit.check.${service}.${state}`, tenantId);
    }
    
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
    
    if (this.metrics) {
      await this.metrics.increment(`circuit.success.${service}`, tenantId);
    }
    
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
    
    if (this.metrics) {
      await this.metrics.increment(`circuit.failure.${service}`, tenantId);
    }
    
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
    if (this.metrics) {
      await this.metrics.increment(`circuit.transition.${prevState}-to-${newState}`, tenantId);
    }
    
    // Emit event for real-time dashboard updates
    this.eventEmitter.emit('circuit-state-change', {
      tenantId,
      service,
      prevState,
      newState,
      timestamp: Date.now()
    });
  }

  // Add event listener for dashboard updates
  onStateChange(listener: (event: any) => void): void {
    this.eventEmitter.on('circuit-state-change', listener);
  }

  // Remove event listener
  offStateChange(listener: (event: any) => void): void {
    this.eventEmitter.off('circuit-state-change', listener);
  }
}

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