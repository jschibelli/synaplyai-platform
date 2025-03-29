import { createClient, RedisClientType } from 'redis';
import { CircuitState, CircuitBreakerStore } from './CircuitBreaker';

export class RedisCircuitBreakerStore implements CircuitBreakerStore {
  private client: RedisClientType;
  private isConnected: boolean = false;
  private keyPrefix: string;
  private expirySeconds: number;

  constructor(redisUrl: string, keyPrefix: string = 'circuit:', expirySeconds: number = 86400) {
    this.client = createClient({ url: redisUrl });
    this.keyPrefix = keyPrefix;
    this.expirySeconds = expirySeconds;

    this.client.on('error', (err) => {
      console.error('Redis Circuit Breaker Store Error:', err);
    });

    this.client.on('connect', () => {
      this.isConnected = true;
    });

    this.client.on('disconnect', () => {
      this.isConnected = false;
    });

    // Connect lazily when needed
  }

  /**
   * Ensure Redis connection is ready
   */
  private async ensureConnection(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
    }
  }

  private getStateKey(key: string): string {
    return `${this.keyPrefix}${key}:state`;
  }

  private getFailureKey(key: string): string {
    return `${this.keyPrefix}${key}:failures`;
  }

  private getSuccessKey(key: string): string {
    return `${this.keyPrefix}${key}:successes`;
  }

  private getLastChangeKey(key: string): string {
    return `${this.keyPrefix}${key}:lastChange`;
  }

  /**
   * Get a circuit breaker by ID
   */
  async getBreaker(tenantId: string, serviceName: string): Promise<any> {
    const breakerId = this.getBreakerKey(tenantId, serviceName);
    return {
      execute: async function<T>(fn: () => Promise<T>): Promise<T> {
        return fn();
      },
      executeWithBulkhead: async function<T>(fn: () => Promise<T>, limit: number): Promise<T> {
        return fn();
      },
      getState: async function(): Promise<CircuitState> {
        return CircuitState.CLOSED;
      }
    };
  }

  /**
   * Get the circuit breaker key for Redis
   */
  private getBreakerKey(tenantId: string, serviceName: string): string {
    return `circuit:${tenantId}:${serviceName}`;
  }

  async getState(key: string): Promise<CircuitState> {
    await this.ensureConnection();
    const state = await this.client.get(this.getStateKey(key));
    return (state as CircuitState) || CircuitState.CLOSED;
  }

  async setState(key: string, state: CircuitState): Promise<void> {
    await this.ensureConnection();
    await this.client.set(this.getStateKey(key), state, { EX: this.expirySeconds });
  }

  async incrementFailures(key: string): Promise<number> {
    await this.ensureConnection();
    const result = await this.client.incr(this.getFailureKey(key));
    await this.client.expire(this.getFailureKey(key), this.expirySeconds);
    return result;
  }

  async incrementSuccesses(key: string): Promise<number> {
    await this.ensureConnection();
    const result = await this.client.incr(this.getSuccessKey(key));
    await this.client.expire(this.getSuccessKey(key), this.expirySeconds);
    return result;
  }

  async resetCounters(key: string): Promise<void> {
    await this.ensureConnection();
    await Promise.all([
      this.client.del(this.getFailureKey(key)),
      this.client.del(this.getSuccessKey(key))
    ]);
  }

  async getLastStateChange(key: string): Promise<Date | null> {
    await this.ensureConnection();
    const timestamp = await this.client.get(this.getLastChangeKey(key));
    return timestamp ? new Date(parseInt(timestamp, 10)) : null;
  }

  async setLastStateChange(key: string, timestamp: Date): Promise<void> {
    await this.ensureConnection();
    await this.client.set(
      this.getLastChangeKey(key), 
      timestamp.getTime().toString(),
      { EX: this.expirySeconds }
    );
  }

  // New methods for bulkhead pattern
  async incrementCounter(key: string, tags?: Record<string, string>): Promise<number> {
    await this.ensureConnection();
    
    let countKey = key;
    if (tags) {
      const tagString = Object.entries(tags)
        .map(([k, v]) => `${k}=${v}`)
        .join(':');
      
      countKey = `${key}:${tagString}`;
    }
    
    const count = await this.client.incr(countKey);
    // Use a shorter expiry for concurrency counters to prevent stuck counters
    await this.client.expire(countKey, 60); // 60 seconds expiry
    return count;
  }

  async decrementCounter(key: string, tags?: Record<string, string>): Promise<number> {
    await this.ensureConnection();
    
    let countKey = key;
    if (tags) {
      const tagString = Object.entries(tags)
        .map(([k, v]) => `${k}=${v}`)
        .join(':');
      
      countKey = `${key}:${tagString}`;
    }
    
    const count = await this.client.decr(countKey);
    // Ensure counter doesn't go below zero
    if (count < 0) {
      await this.client.set(countKey, '0');
      return 0;
    }
    return count;
  }
}