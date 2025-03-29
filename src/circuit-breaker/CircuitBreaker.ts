import { MetricsCollector } from '../services/metrics/MetricsCollector';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  successThreshold?: number;
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

export class CircuitBreaker {
  public state: CircuitState = CircuitState.CLOSED;
  public failureCount: number = 0;
  public successCount: number = 0;
  public lastStateChange: number = Date.now();
  public serviceName: string;
  
  private options: CircuitBreakerOptions;
  private stateRepository: CircuitBreakerStore;
  private metricsCollector?: MetricsCollector;

  constructor(
    serviceName: string, 
    options: CircuitBreakerOptions, 
    stateRepository: CircuitBreakerStore,
    metricsCollector?: MetricsCollector
  ) {
    this.serviceName = serviceName;
    this.options = {
      failureThreshold: options.failureThreshold,
      resetTimeout: options.resetTimeout,
      successThreshold: options.successThreshold || 1
    };
    this.stateRepository = stateRepository;
    this.metricsCollector = metricsCollector;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const currentState = await this.getState();
    
    if (currentState === CircuitState.OPEN) {
      const lastChange = await this.getLastStateChange();
      
      if (lastChange && Date.now() - lastChange.getTime() > this.options.resetTimeout) {
        await this.transitionToState(CircuitState.HALF_OPEN);
      } else {
        if (this.metricsCollector) {
          await this.metricsCollector.track('circuit_breaker.rejected', {
            service: this.serviceName,
            state: currentState
          });
        }
        throw new Error(`Circuit breaker is open for ${this.serviceName}`);
      }
    }
    
    try {
      const result = await fn();
      await this.recordSuccess();
      return result;
    } catch (error) {
      await this.recordFailure();
      throw error;
    }
  }

  /**
   * Execute a function with bulkhead protection (concurrency limiting)
   */
  async executeWithBulkhead<T>(fn: () => Promise<T>, concurrencyLimit: number): Promise<T> {
    const counterKey = `bulkhead:${this.serviceName}`;
    
    try {
      const currentCount = await this.stateRepository.incrementCounter(counterKey);
      
      if (currentCount > concurrencyLimit) {
        await this.stateRepository.decrementCounter(counterKey);
        
        if (this.metricsCollector) {
          await this.metricsCollector.track('bulkhead.rejected', {
            service: this.serviceName,
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
   * Transition to a new circuit state
   */
  async transitionToState(newState: CircuitState): Promise<void> {
    if (this.state === newState) return;
    
    this.state = newState;
    await this.stateRepository.setState(this.serviceName, newState);
    await this.stateRepository.setLastStateChange(this.serviceName, new Date());
    
    if (newState === CircuitState.CLOSED || newState === CircuitState.HALF_OPEN) {
      await this.stateRepository.resetCounters(this.serviceName);
      this.failureCount = 0;
      this.successCount = 0;
    }
    
    if (this.metricsCollector) {
      await this.metricsCollector.track('circuit_breaker.state_changed', {
        service: this.serviceName,
        state: newState
      });
    }
  }

  /**
   * Get the current circuit state
   */
  async getState(): Promise<CircuitState> {
    const state = await this.stateRepository.getState(this.serviceName);
    this.state = state;
    return state;
  }

  /**
   * Record a successful operation
   */
  async recordSuccess(): Promise<void> {
    if (this.state === CircuitState.HALF_OPEN) {
      const successes = await this.stateRepository.incrementSuccesses(this.serviceName);
      this.successCount = successes;
      
      if (successes >= this.options.successThreshold!) {
        await this.transitionToState(CircuitState.CLOSED);
      }
    }
    
    if (this.metricsCollector) {
      await this.metricsCollector.track('circuit_breaker.success', {
        service: this.serviceName,
        state: this.state
      });
    }
  }

  /**
   * Record a failed operation
   */
  async recordFailure(): Promise<void> {
    if (this.state === CircuitState.CLOSED) {
      const failures = await this.stateRepository.incrementFailures(this.serviceName);
      this.failureCount = failures;
      
      if (failures >= this.options.failureThreshold) {
        await this.transitionToState(CircuitState.OPEN);
      }
    } else if (this.state === CircuitState.HALF_OPEN) {
      await this.transitionToState(CircuitState.OPEN);
    }
    
    if (this.metricsCollector) {
      await this.metricsCollector.track('circuit_breaker.failure', {
        service: this.serviceName,
        state: this.state
      });
    }
  }

  /**
   * Check if the circuit should attempt to reset
   */
  async shouldAttemptReset(): Promise<boolean> {
    if (this.state !== CircuitState.OPEN) return false;
    
    const lastChange = await this.getLastStateChange();
    if (!lastChange) return false;
    
    return Date.now() - lastChange.getTime() > this.options.resetTimeout;
  }

  /**
   * Get the last state change time
   */
  private async getLastStateChange(): Promise<Date | null> {
    return this.stateRepository.getLastStateChange(this.serviceName);
  }
}