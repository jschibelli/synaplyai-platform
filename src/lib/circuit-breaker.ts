import { getTenantContext } from './tenant-context';
import { MetricsCollector } from '../services/metrics/MetricsCollector';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Failing, all requests rejected
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

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
  tenantIsolation?: boolean;
  stateRepository?: CircuitBreakerStateRepository;
}

/**
 * Interface for circuit breaker state storage
 */
export interface CircuitBreakerStateRepository {
  getState(serviceName: string, tenantId: string): Promise<CircuitBreakerState | null>;
  setState(serviceName: string, tenantId: string, state: CircuitBreakerState): Promise<void>;
}

/**
 * Memory-based circuit breaker state repository
 */
class InMemoryStateRepository implements CircuitBreakerStateRepository {
  private states: Map<string, CircuitBreakerState> = new Map();
  
  async getState(serviceName: string, tenantId: string): Promise<CircuitBreakerState | null> {
    const key = `${serviceName}:${tenantId}`;
    return this.states.get(key) || null;
  }
  
  async setState(serviceName: string, tenantId: string, state: CircuitBreakerState): Promise<void> {
    const key = `${serviceName}:${tenantId}`;
    this.states.set(key, state);
  }
}

/**
 * Circuit breaker implementation for resilience
 */
export class CircuitBreaker {
  public state: CircuitState = CircuitState.CLOSED;
  public failureCount: number = 0;
  public successCount: number = 0;
  public lastStateChange: number = Date.now();
  public serviceName: string;
  
  private options: CircuitBreakerOptions;
  private stateRepository: CircuitBreakerStateRepository;
  private metricsCollector?: MetricsCollector;
  private bulkheadCounter: number = 0;

  constructor(
    serviceName: string,
    options: Partial<CircuitBreakerOptions> = {},
    metricsCollector?: MetricsCollector
  ) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 3,
      resetTimeoutMs: options.resetTimeoutMs || 30000,
      monitorIntervalMs: options.monitorIntervalMs || 10000,
      tenantIsolation: options.tenantIsolation !== false, // Default to true
      stateRepository: options.stateRepository || new InMemoryStateRepository()
    };
    
    this.serviceName = serviceName;
    this.stateRepository = this.options.stateRepository as CircuitBreakerStateRepository;
    this.metricsCollector = metricsCollector;
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    const tenantId = this.getTenantId();
    
    // Get current state
    let state = await this.getState(tenantId);
    
    // Check if circuit is open
    if (state.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset(state)) {
        // Transition to half-open
        await this.transitionState(tenantId, CircuitState.HALF_OPEN);
      } else {
        if (this.metricsCollector) {
          await this.metricsCollector.track('circuit_breaker.rejected', {
            service: this.serviceName,
            state: this.state
          });
        }
        throw new Error(`Circuit for ${this.serviceName} is OPEN`);
      }
    }
    
    // At this point, circuit is either CLOSED or HALF_OPEN
    try {
      // Execute function
      const result = await fn();
      
      // Record success
      await this.recordSuccess(tenantId);
      
      return result;
    } catch (error) {
      // Record failure
      await this.recordFailure(tenantId);
      
      throw error;
    }
  }

  /**
   * Execute a function with concurrency limiting
   */
  async executeWithBulkhead<T>(fn: () => Promise<T>, concurrencyLimit: number): Promise<T> {
    try {
      this.bulkheadCounter++;
      
      if (this.bulkheadCounter > concurrencyLimit) {
        this.bulkheadCounter--;
        
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
        this.bulkheadCounter--;
      }
    } catch (error) {
      if (error.message !== 'Bulkhead limit reached') {
        this.bulkheadCounter--;
      }
      throw error;
    }
  }

  /**
   * Get current circuit state
   */
  private async getState(tenantId: string): Promise<CircuitBreakerState> {
    const storedState = await this.stateRepository.getState(this.serviceName, tenantId);
    
    if (storedState) {
      return storedState;
    }
    
    // Initial state is CLOSED
    return {
      state: CircuitState.CLOSED,
      failureCount: 0,
      successCount: 0
    };
  }
  
  /**
   * Record a successful execution
   */
  private async recordSuccess(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    
    if (state.state === CircuitState.HALF_OPEN) {
      // In half-open state, increment success count
      state.successCount++;
      
      // Check if we've reached the success threshold
      if (state.successCount >= this.options.successThreshold) {
        // Transition back to closed
        await this.transitionState(tenantId, CircuitState.CLOSED);
      } else {
        // Update state
        await this.stateRepository.setState(this.serviceName, tenantId, state);
      }
    } else if (state.state === CircuitState.CLOSED) {
      // In closed state, reset failure count on success
      if (state.failureCount > 0) {
        state.failureCount = 0;
        await this.stateRepository.setState(this.serviceName, tenantId, state);
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
   * Record a failed execution
   */
  private async recordFailure(tenantId: string): Promise<void> {
    const state = await this.getState(tenantId);
    const now = Date.now();
    
    if (state.state === CircuitState.CLOSED) {
      // Increment failure count
      state.failureCount++;
      state.lastFailure = now;
      
      // Check if we've reached the failure threshold
      if (state.failureCount >= this.options.failureThreshold) {
        // Transition to open
        await this.transitionState(tenantId, CircuitState.OPEN);
      } else {
        // Update state
        await this.stateRepository.setState(this.serviceName, tenantId, state);
      }
    } else if (state.state === CircuitState.HALF_OPEN) {
      // In half-open state, any failure trips the circuit
      await this.transitionState(tenantId, CircuitState.OPEN);
    }
    
    if (this.metricsCollector) {
      await this.metricsCollector.track('circuit_breaker.failure', {
        service: this.serviceName,
        state: this.state
      });
    }
  }
  
  /**
   * Transition circuit state
   */
  private async transitionState(tenantId: string, newState: CircuitState): Promise<void> {
    const state = await this.getState(tenantId);
    const now = Date.now();
    
    // Update state
    state.state = newState;
    state.lastStateChange = now;
    
    // Reset counters on state change
    if (newState === CircuitState.CLOSED) {
      state.failureCount = 0;
      state.successCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      state.successCount = 0;
    } else if (newState === CircuitState.OPEN) {
      state.successCount = 0;
    }
    
    // Update state in repository
    await this.stateRepository.setState(this.serviceName, tenantId, state);
    
    if (this.metricsCollector) {
      await this.metricsCollector.track('circuit_breaker.state_changed', {
        service: this.serviceName,
        state: newState
      });
    }
  }
  
  /**
   * Check if we should attempt to reset the circuit
   */
  private shouldAttemptReset(state: CircuitBreakerState): boolean {
    // If no state change timestamp, we can't determine reset time
    if (!state.lastStateChange) {
      return false;
    }
    
    const now = Date.now();
    const elapsedMs = now - state.lastStateChange;
    
    // Check if enough time has elapsed since opening the circuit
    return elapsedMs > this.options.resetTimeoutMs;
  }
  
  /**
   * Get tenant ID for isolation
   */
  private getTenantId(): string {
    if (!this.options.tenantIsolation) {
      // If tenant isolation is disabled, use a global key
      return 'global';
    }
    
    const tenantContext = getTenantContext();
    return tenantContext?.tenantId || 'global';
  }
  
  /**
   * Transitions the circuit to a new state
   */
  async transitionToState(newState: CircuitState): Promise<void> {
    if (this.state === newState) return;
    
    this.state = newState;
    this.lastStateChange = Date.now();
    
    if (newState === CircuitState.CLOSED || newState === CircuitState.HALF_OPEN) {
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