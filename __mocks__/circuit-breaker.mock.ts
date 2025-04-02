import { jest } from '@jest/globals';
import { CircuitState } from '../src/lib/circuit-breaker';

/**
 * Interface for the circuit breaker mock
 */
export interface MockCircuitBreaker {
  // Required properties from CircuitBreaker
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastStateChange: number;
  failureThreshold: number;
  resetTimeout: number;
  halfOpenSuccessThreshold: number;
  options: any;
  serviceName: string;
  metrics: any;
  
  // Function properties
  execute: ReturnType<typeof jest.fn>;
  executeWithBulkhead: ReturnType<typeof jest.fn>;
  getState: ReturnType<typeof jest.fn>;
  setState: ReturnType<typeof jest.fn>;
  incrementFailures: ReturnType<typeof jest.fn>;
  incrementSuccesses: ReturnType<typeof jest.fn>;
  resetCounters: ReturnType<typeof jest.fn>;
  isOpen: ReturnType<typeof jest.fn>;
  isClosed: ReturnType<typeof jest.fn>;
  isHalfOpen: ReturnType<typeof jest.fn>;
  openCircuit: ReturnType<typeof jest.fn>;
  closeCircuit: ReturnType<typeof jest.fn>;
  halfOpenCircuit: ReturnType<typeof jest.fn>;
  getFailureCount: ReturnType<typeof jest.fn>;
  getSuccessCount: ReturnType<typeof jest.fn>;
  transitionState: ReturnType<typeof jest.fn>;
  recordFailure: ReturnType<typeof jest.fn>;
  recordSuccess: ReturnType<typeof jest.fn>;
  shouldAttemptReset: ReturnType<typeof jest.fn>;
  transitionToState: ReturnType<typeof jest.fn>;
}

/**
 * Creates a mock circuit breaker for testing
 */
export function createCircuitBreakerMock(): MockCircuitBreaker {
  return {
    state: CircuitState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastStateChange: Date.now(),
    failureThreshold: 3,
    resetTimeout: 30000,
    halfOpenSuccessThreshold: 2,
    options: {},
    serviceName: 'test-service',
    metrics: {},
    
    // Fix: Type the function parameter properly
    execute: jest.fn().mockImplementation((fn: () => any) => Promise.resolve(fn())),
    
    // Fix: Type the function parameter properly
    executeWithBulkhead: jest.fn().mockImplementation((fn: () => any) => Promise.resolve(fn())),
    
    getState: jest.fn().mockReturnValue(CircuitState.CLOSED),
    setState: jest.fn(),
    incrementFailures: jest.fn(),
    incrementSuccesses: jest.fn(),
    resetCounters: jest.fn(),
    isOpen: jest.fn().mockReturnValue(false),
    isClosed: jest.fn().mockReturnValue(true),
    isHalfOpen: jest.fn().mockReturnValue(false),
    openCircuit: jest.fn(),
    closeCircuit: jest.fn(),
    halfOpenCircuit: jest.fn(),
    getFailureCount: jest.fn().mockReturnValue(0),
    getSuccessCount: jest.fn().mockReturnValue(0),
    transitionState: jest.fn(),
    recordFailure: jest.fn(),
    recordSuccess: jest.fn(),
    shouldAttemptReset: jest.fn().mockReturnValue(false),
    transitionToState: jest.fn()
  };
}

// Export a singleton instance
export const circuitBreakerMock = createCircuitBreakerMock();

export default circuitBreakerMock;