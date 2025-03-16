import { createClient } from 'redis';
import { CircuitBreakerStore, CircuitState } from './interfaces';

export class RedisCircuitBreakerStore implements CircuitBreakerStore {
  private client;
  private keyPrefix: string;
  private expirySeconds: number;
  
  constructor(redisUrl: string, keyPrefix: string = 'circuit:', expirySeconds: number = 86400) {
    this.client = createClient({ url: redisUrl });
    this.keyPrefix = keyPrefix;
    this.expirySeconds = expirySeconds;
    
    // Connect to Redis
    this.client.connect().catch(err => {
      console.error('Redis connection error:', err);
    });
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
  
  async getState(key: string): Promise<CircuitState> {
    const state = await this.client.get(this.getStateKey(key));
    return (state as CircuitState) || CircuitState.CLOSED;
  }
  
  async setState(key: string, state: CircuitState): Promise<void> {
    await this.client.set(this.getStateKey(key), state, { EX: this.expirySeconds });
  }
  
  async incrementFailures(key: string): Promise<number> {
    const result = await this.client.incr(this.getFailureKey(key));
    await this.client.expire(this.getFailureKey(key), this.expirySeconds);
    return result;
  }
  
  async incrementSuccesses(key: string): Promise<number> {
    const result = await this.client.incr(this.getSuccessKey(key));
    await this.client.expire(this.getSuccessKey(key), this.expirySeconds);
    return result;
  }
  
  async resetCounters(key: string): Promise<void> {
    await Promise.all([
      this.client.del(this.getFailureKey(key)),
      this.client.del(this.getSuccessKey(key))
    ]);
  }
  
  async getLastStateChange(key: string): Promise<Date | null> {
    const timestamp = await this.client.get(this.getLastChangeKey(key));
    return timestamp ? new Date(parseInt(timestamp, 10)) : null;
  }
  
  async setLastStateChange(key: string, timestamp: Date): Promise<void> {
    await this.client.set(
      this.getLastChangeKey(key), 
      timestamp.getTime().toString(),
      { EX: this.expirySeconds }
    );
  }
}