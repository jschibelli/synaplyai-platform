import { CircuitState } from '../src/lib/circuit-breaker';

/**
 * MockCircuitBreaker interface - single source of truth for circuit breaker mocks
 */
export interface MockCircuitBreaker {
  serviceName: string;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastStateChange: number;
  execute: jest.Mock;
  executeWithBulkhead: jest.Mock;
  getState: jest.Mock;
  recordSuccess: jest.Mock;
  recordFailure: jest.Mock;
  transitionState: jest.Mock;
  transitionToState: jest.Mock;
  shouldAttemptReset: jest.Mock;
  options: {
    failureThreshold: number;
    successThreshold: number;
    resetTimeoutMs: number;
  };
}

/**
 * Create a circuit breaker mock with all required methods
 * Ensures all mock methods are properly created with jest.fn()
 */
export function createCircuitBreakerMock(): MockCircuitBreaker {
  return {
    serviceName: 'test-service',
    state: CircuitState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastStateChange: Date.now(),
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn().mockImplementation((fn, concurrencyLimit = 10) => fn()),
    getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    transitionState: jest.fn().mockResolvedValue(undefined),
    transitionToState: jest.fn().mockResolvedValue(undefined),
    shouldAttemptReset: jest.fn().mockReturnValue(false),
    options: {
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeoutMs: 30000
    }
  };
}

// Export a singleton instance for convenience
export const circuitBreakerMock = createCircuitBreakerMock();