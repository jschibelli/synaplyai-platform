import { getTenantContext } from './tenant-context';

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
 * Circuit breaker implementation
 */
export class CircuitBreaker {
  private options: CircuitBreakerOptions;
  private stateRepository: CircuitBreakerStateRepository;
  
  constructor(
    private serviceName: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 3,
      resetTimeoutMs: options.resetTimeoutMs || 30000,
      monitorIntervalMs: options.monitorIntervalMs || 10000,
      tenantIsolation: options.tenantIsolation !== false, // Default to true
      stateRepository: options.stateRepository || new InMemoryStateRepository()
    };
    
    this.stateRepository = this.options.stateRepository as CircuitBreakerStateRepository;
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
}