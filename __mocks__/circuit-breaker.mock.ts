import { jest } from '@jest/globals';
import { CircuitState } from '../src/lib/circuit-breaker';

/**
 * Interface for the circuit breaker mock
 */
export interface MockCircuitBreaker {
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
  
  // Add all required methods
  execute: jest.Mock;
  executeWithBulkhead: jest.Mock;
  getState: jest.Mock;
  setState: jest.Mock;
  incrementFailures: jest.Mock;
  incrementSuccesses: jest.Mock;
  resetCounters: jest.Mock;
  isOpen: jest.Mock;
  isClosed: jest.Mock;
  isHalfOpen: jest.Mock;
  openCircuit: jest.Mock;
  closeCircuit: jest.Mock;
  halfOpenCircuit: jest.Mock;
  getFailureCount: jest.Mock;
  getSuccessCount: jest.Mock;
  transitionState: jest.Mock;
  recordFailure: jest.Mock;
  recordSuccess: jest.Mock;
  shouldAttemptReset: jest.Mock;
  transitionToState: jest.Mock;
  checkState: jest.Mock;
}

/**
 * Creates a mock circuit breaker for testing
 */
export function createCircuitBreakerMock(): MockCircuitBreaker {
  return {
    // Required properties
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
    
    // Fixed version - check if fn is a function before calling it
    execute: jest.fn().mockImplementation((fn) => Promise.resolve(typeof fn === 'function' ? fn() : undefined)),
    executeWithBulkhead: jest.fn().mockImplementation((fn) => Promise.resolve(typeof fn === 'function' ? fn() : undefined)),
    
    // Other methods
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
    transitionToState: jest.fn(),
    checkState: jest.fn().mockImplementation(() => Promise.resolve())
  };
}

// Export a singleton instance
export const circuitBreakerMock = createCircuitBreakerMock();

export default circuitBreakerMock;