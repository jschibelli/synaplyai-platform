<<<<<<< HEAD
import { CircuitBreaker, CircuitState } from '../lib/circuit-breaker';

/**
 * Create a standardized CircuitBreaker mock that implements all needed methods
 * Used across all tests to ensure consistency
 */
export const createCircuitBreakerMock = () => ({
  // Base methods from CircuitBreaker
  execute: jest.fn().mockImplementation(fn => fn()),
  getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined),
  transitionState: jest.fn().mockResolvedValue(undefined),
  shouldAttemptReset: jest.fn().mockReturnValue(false),
  getTenantId: jest.fn().mockReturnValue('test-tenant'),
  
  // AdaptiveCircuitBreaker methods
  executeWithBulkhead: jest.fn().mockImplementation(fn => fn()),
  updateThresholds: jest.fn().mockResolvedValue(undefined),
  
  // Internal methods exposed for testing
  getStore: jest.fn().mockReturnValue({
    incrementCounter: jest.fn().mockResolvedValue(0),
    decrementCounter: jest.fn().mockResolvedValue(0),
    getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
    setState: jest.fn().mockResolvedValue(undefined),
    incrementFailures: jest.fn().mockResolvedValue(0),
    incrementSuccesses: jest.fn().mockResolvedValue(0),
    resetCounters: jest.fn().mockResolvedValue(undefined),
    getLastStateChange: jest.fn().mockResolvedValue(new Date()),
    setLastStateChange: jest.fn().mockResolvedValue(undefined)
  }),

  // Event handling
  on: jest.fn(),
  once: jest.fn(),
  emit: jest.fn(),
  eventEmitter: {
    on: jest.fn(),
    once: jest.fn(),
    emit: jest.fn()
  }
});

/**
 * Singleton instance for convenience
 */
export const circuitBreakerMock = createCircuitBreakerMock();

/**
 * Helper to create a CircuitState-compatible value regardless of how it's defined
 * (string or enum) to work with all test contexts
 */
export const createCircuitState = (state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): any => {
  return state in CircuitState ? CircuitState[state as keyof typeof CircuitState] : state;
};
=======
import { createTypedMock } from './jest-mock-extensions';
import { CircuitState } from '../lib/circuit-breaker';

export function createCircuitBreakerMock() {
  return {
    // Required properties from errors
    state: CircuitState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastStateChange: Date.now(),
    
    // Required methods
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn().mockImplementation(fn => fn()),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
    reset: jest.fn().mockResolvedValue(undefined),
    transitionState: jest.fn().mockResolvedValue(undefined),
    shouldAttemptReset: jest.fn().mockReturnValue(false),
    
    // Configuration
    options: {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 30000
    },
    serviceName: 'test-service'
  };
}

export const circuitBreakerMock = createCircuitBreakerMock();
>>>>>>> debug
