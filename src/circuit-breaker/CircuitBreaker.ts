import { MetricsCollector } from '../services/metrics/MetricsCollector';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenSuccessThreshold?: number;
  name?: string;
}

export interface CircuitBreakerStore {
  getState(key: string): Promise<CircuitState>;
  setState(key: string, state: CircuitState): Promise<void>;
  incrementFailures(key: string): Promise<number>;
  incrementSuccesses(key: string): Promise<number>;
  resetCounters(key: string): Promise<void>;
  getLastStateChange(key: string): Promise<Date | null>;
  setLastStateChange(key: string, date: Date): Promise<void>;
  incrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  decrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
}

export interface CircuitBreakerInterface {
  execute<T>(fn: () => Promise<T>): Promise<T>;
  getState(): CircuitState;
  recordSuccess(): void;
  recordFailure(): void;
  transitionState(newState: CircuitState): void;
  shouldAttemptReset(): boolean;
}

export class CircuitBreaker implements CircuitBreakerInterface {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastStateChangeTime: number = Date.now();
  private readonly failureThreshold: number;
  private readonly resetTimeout: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly name: string;
  
  private stateRepository: CircuitBreakerStore;
  private metricsCollector?: MetricsCollector;

  constructor(
    options: CircuitBreakerOptions = {},
    stateRepository: CircuitBreakerStore,
    metricsCollector?: MetricsCollector
  ) {
    this.failureThreshold = options.failureThreshold || 5;
    this.resetTimeout = options.resetTimeout || 30000; // 30 seconds
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold || 3;
    this.name = options.name || 'default';
    this.stateRepository = stateRepository;
    this.metricsCollector = metricsCollector;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionState(CircuitState.HALF_OPEN);
      } else {
        throw new Error(`Circuit breaker (${this.name}) is open`);
      }
    }

    try {
      const result = await fn();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.transitionState(CircuitState.CLOSED);
      }
    }
  }

  recordFailure(): void {
    if (this.state === CircuitState.CLOSED) {
      this.failureCount++;
      if (this.failureCount >= this.failureThreshold) {
        this.transitionState(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      this.transitionState(CircuitState.OPEN);
    }
  }

  transitionState(newState: CircuitState): void {
    this.state = newState;
    this.lastStateChangeTime = Date.now();
    
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
  }

  shouldAttemptReset(): boolean {
    return Date.now() - this.lastStateChangeTime > this.resetTimeout;
  }

  /**
   * Execute a function with bulkhead protection (concurrency limiting)
   */
  async executeWithBulkhead<T>(fn: () => Promise<T>, concurrencyLimit: number): Promise<T> {
    const counterKey = `bulkhead:${this.name}`;
    
    try {
      const currentCount = await this.stateRepository.incrementCounter(counterKey);
      
      if (currentCount > concurrencyLimit) {
        await this.stateRepository.decrementCounter(counterKey);
        
        if (this.metricsCollector) {
          await this.metricsCollector.track('bulkhead.rejected', {
            service: this.name,
            limit: concurrencyLimit.toString()
          });
        }
        
        throw new Error('Bulkhead limit reached');
      }
      
      try {
        return await fn();
      } finally {
        await this.stateRepository.decrementCounter(counterKey);
      }
    } catch (error) {
      if (error.message !== 'Bulkhead limit reached') {
        await this.stateRepository.decrementCounter(counterKey);
      }
      throw error;
    }
  }

  /**
   * Get the last state change time
   */
  private async getLastStateChange(): Promise<Date | null> {
    return this.stateRepository.getLastStateChange(this.name);
  }
}

export default CircuitBreaker;