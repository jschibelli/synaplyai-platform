import { jest } from '@jest/globals';

// Define CircuitState enum directly to avoid circular dependencies
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

// Type for functions that will be passed to execute methods
type ExecutableFunction = (...args: any[]) => any;

/**
 * Factory function to create a circuit breaker mock
 */
export function createCircuitBreakerMock() {
  return {
    execute: jest.fn().mockImplementation((fn: ExecutableFunction) => fn()),
    getState: jest.fn().mockReturnValue(CircuitState.CLOSED),
    setState: jest.fn(),
    incrementFailures: jest.fn().mockReturnValue(0),
    incrementSuccesses: jest.fn().mockReturnValue(0),
    resetCounters: jest.fn(),
    close: jest.fn(),
    open: jest.fn(),
    halfOpen: jest.fn(),
    isOpen: jest.fn().mockReturnValue(false),
    isClosed: jest.fn().mockReturnValue(true),
    isHalfOpen: jest.fn().mockReturnValue(false),
    onStateChange: jest.fn(),
    executeWithBulkhead: jest.fn().mockImplementation((fn: ExecutableFunction) => fn()),
    serviceName: 'test-service',
    transitionToState: jest.fn().mockImplementation(() => Promise.resolve())
  };
}

// Create a pre-initialized instance that can be imported directly
export const circuitBreakerMock = createCircuitBreakerMock();

// Default export for backwards compatibility
export default circuitBreakerMock;

/**
 * Helper to create a CircuitState-compatible value regardless of how it's defined
 * (string or enum) to work with all test contexts
 */
export const createCircuitState = (state: 'CLOSED' | 'OPEN' | 'HALF_OPEN'): any => {
  return state in CircuitState ? CircuitState[state as keyof typeof CircuitState] : state;
};

