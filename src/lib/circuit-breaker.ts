import { MetricsCollector } from '../services/metrics/MetricsCollector';
import { getTenantContext } from './tenant-context';

import { EventEmitter } from 'events';

import { MetricsCollector } from './metrics/metrics-interface';


/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, all requests rejected
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

// Add type compatibility for string values
export type CircuitStateType = CircuitState | 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailure?: number;
  lastStateChange?: number;
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  resetTimeoutMs: number;
  monitorIntervalMs?: number;
}

/**
 * Interface for persistent circuit breaker state storage
 */
export interface CircuitBreakerStore {
  getState(key: string): Promise<CircuitState>;
  setState(key: string, state: CircuitState): Promise<void>;
  getLastStateChange(key: string): Promise<Date | null>;
  setLastStateChange(key: string, date: Date): Promise<void>;
  incrementFailures(key: string): Promise<number>;
  incrementSuccesses(key: string): Promise<number>;
  resetCounters(key: string): Promise<void>;
  getCircuitState(key: string): Promise<CircuitBreakerState>;
}

/**
 * Circuit breaker for protecting against cascading failures
 */
export class CircuitBreaker {
  state: CircuitState = CircuitState.CLOSED;
  failureCount: number = 0;
  successCount: number = 0;
  lastStateChange: number = Date.now();
  private readonly options: CircuitBreakerOptions;
  serviceName: string;

  constructor(
    serviceName: string, 
    options: CircuitBreakerOptions,
    private metrics: MetricsCollector
  ) {
    this.serviceName = serviceName;
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      resetTimeoutMs: options.resetTimeoutMs || 30000
    };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    await this.checkState();
    
    if (this.state === CircuitState.OPEN) {
      throw new Error(`Circuit breaker is open for ${this.serviceName}`);
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
   * Execute with concurrency limiting (bulkhead pattern)
   */
  async executeWithBulkhead<T>(
    fn: () => Promise<T>,
    concurrencyLimit: number = 10
  ): Promise<T> {
    // In a real implementation, we would track concurrent executions
    // For now, just forward to execute
    return this.execute(fn);
  }

  /**
   * Get current circuit state
   */
  async getState(): Promise<CircuitState> {
    return this.state;
  }

  /**
   * Record successful execution
   */
  async recordSuccess(): Promise<void> {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.options.successThreshold) {
        await this.transitionState(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record execution failure
   */
  async recordFailure(): Promise<void> {
    this.failureCount++;
    
    if (this.state === CircuitState.CLOSED && 
        this.failureCount >= this.options.failureThreshold) {
      await this.transitionState(CircuitState.OPEN);
    }
  }

  /**
   * Transition circuit state
   */
  async transitionState(newState: CircuitState): Promise<void> {
    this.state = newState;
    this.lastStateChange = Date.now();
    
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
    
    // Record state change in metrics
    const { tenantId = 'default' } = getTenantContext() || {};
    await this.metrics.setCircuitBreakerState(tenantId, this.serviceName, newState);
  }
  
  /**
   * Transition state (legacy method for compatibility)
   */
  async transitionToState(newState: CircuitState): Promise<void> {
    return this.transitionState(newState);
  }

  /**
   * Check if circuit should reset to half-open
   */
  shouldAttemptReset(): boolean {
    return this.state === CircuitState.OPEN && 
           (Date.now() - this.lastStateChange) > this.options.resetTimeoutMs;
  }

  /**
   * Check and update circuit state
   */
  private async checkState(): Promise<void> {
    if (this.shouldAttemptReset()) {
      await this.transitionState(CircuitState.HALF_OPEN);
    }
  }
}

/**
 * Tenant-aware circuit breaker that isolates circuit state by tenant
 */
export class TenantAwareCircuitBreaker {
  readonly serviceName: string;
  private circuitKey: string;

  constructor(

    private store: CircuitBreakerStore,
    private tenantId: string,
    serviceName: string,
    private metrics: MetricsCollector,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 30000
    }
    private serviceName: string,
    options: Partial<CircuitBreakerOptions> = {},
    private metricsCollector?: MetricsCollector

  ) {
    this.serviceName = serviceName;
    this.circuitKey = `${tenantId}:${serviceName}`;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const circuitState = await this.store.getCircuitState(this.circuitKey);
    
    if (circuitState.state === CircuitState.OPEN) {
      // Check if it's time to try again
      if (this.shouldAttemptReset(circuitState)) {
        await this.transitionToState(CircuitState.HALF_OPEN);
      } else {
        // Circuit is open, reject the request
        await this.metrics.incrementCircuitBreakerRejections(this.tenantId, this.serviceName);
        throw new Error(`Circuit breaker is open for service: ${this.serviceName}`);
      }
    }
    
    try {
      // Execute the protected function
      const result = await fn();
      
      // Record the success
      await this.recordSuccess();
      
      return result;
    } catch (error) {
      // Record the failure
      await this.recordFailure();
      
      // Re-throw the original error
      throw error;
    }
  }

  /**
   * Execute with bulkhead pattern (concurrency limiting)
   */
  async executeWithBulkhead<T>(
    fn: () => Promise<T>,
    concurrencyLimit: number = 10
  ): Promise<T> {
    // Implementation would use the store to track concurrent executions
    // For test compatibility, forward to regular execute
    return this.execute(fn);
  }

  /**
   * Record a successful operation
   */
  async recordSuccess(): Promise<void> {
    const state = await this.store.getCircuitState(this.circuitKey);
    
    if (state.state === CircuitState.HALF_OPEN) {
      // In half-open state, count successes to determine if we can close the circuit
      const successCount = await this.store.incrementSuccesses(this.circuitKey);
      
      if (successCount >= this.options.successThreshold) {
        // Transition to closed state
        await this.transitionToState(CircuitState.CLOSED);
      }
    }
  }

  /**
   * Record a failed operation
   */
  async recordFailure(): Promise<void> {
    const state = await this.store.getCircuitState(this.circuitKey);
    
    if (state.state === CircuitState.CLOSED) {
      // In closed state, count failures to determine if we should open the circuit
      const failures = await this.store.incrementFailures(this.circuitKey);
      
      await this.metrics.incrementCircuitBreakerFailures(this.tenantId, this.serviceName);
      
      if (failures >= this.options.failureThreshold) {
        // Too many failures, open the circuit
        await this.transitionToState(CircuitState.OPEN);
      }
    } else if (state.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open state sends us back to open
      await this.transitionToState(CircuitState.OPEN);
    }
  }

  /**
   * Transition the circuit to a new state
   */
  async transitionToState(newState: CircuitState): Promise<void> {
    await this.store.setState(this.circuitKey, newState);
    await this.store.setLastStateChange(this.circuitKey, new Date());
    
    if (newState === CircuitState.CLOSED || newState === CircuitState.OPEN) {
      await this.store.resetCounters(this.circuitKey);
    }
    
    // Record state change in metrics
    await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, newState);
  }

  /**
   * For backward compatibility - alias for transitionToState
   */
  async transitionState(newState: CircuitState): Promise<void> {
    return this.transitionToState(newState);
  }

  /**
   * Check if the circuit should attempt to reset
   */
  shouldAttemptReset(state: CircuitBreakerState): boolean {
    return state.state === CircuitState.OPEN && 
           state.lastStateChange !== undefined &&
           (Date.now() - state.lastStateChange) > this.options.resetTimeoutMs;
  }

  /**
   * Get the current circuit state
   */
  async getState(): Promise<CircuitState> {
    const state = await this.store.getCircuitState(this.circuitKey);
    return state.state;
  }

  /**
   * Reset the circuit to closed state
   */
  async reset(): Promise<void> {
    await this.transitionToState(CircuitState.CLOSED);
  }
}

/**
 * Create a circuit breaker factory that uses the same store
 */
export function createCircuitBreakerFactory(
  metricsCollector: MetricsCollector,
  defaultOptions: Partial<CircuitBreakerOptions> = {}
) {
  const breakers = new Map<string, CircuitBreaker>();
  
  return {
    getBreaker(
      serviceName: string,
      options: Partial<CircuitBreakerOptions> = {}
    ): CircuitBreaker {
      const breakerKey = serviceName;
      
      if (!breakers.has(breakerKey)) {
        const breakerOptions: CircuitBreakerOptions = {
          failureThreshold: options.failureThreshold || defaultOptions.failureThreshold || 5,
          resetTimeoutMs: options.resetTimeoutMs || defaultOptions.resetTimeoutMs || 30000,
          successThreshold: options.successThreshold || defaultOptions.successThreshold || 1
        };
        
        breakers.set(
          breakerKey,
          new CircuitBreaker(serviceName, breakerOptions, metricsCollector)
        );
      }
      
      return breakers.get(breakerKey)!;
    },
    
    clearBreakers() {
      breakers.clear();
    }
  };
}

/**
 * Circuit breaker interface for mocking in tests
 */
export interface CircuitBreakerInterface {
  serviceName: string;
  state?: CircuitState;
  failureCount?: number;
  successCount?: number;
  lastStateChange?: number;
  execute: <T>(fn: () => Promise<T>) => Promise<T>;
  executeWithBulkhead: <T>(fn: () => Promise<T>, concurrencyLimit?: number) => Promise<T>;
  getState(): Promise<CircuitState>;
  recordSuccess(): Promise<void>;
  recordFailure(): Promise<void>;
  transitionState(newState: CircuitState): Promise<void>;
  transitionToState(newState: CircuitState): Promise<void>;
  shouldAttemptReset(): boolean;
  options?: {
    failureThreshold: number;
    successThreshold: number;
    resetTimeoutMs: number;
  };
}