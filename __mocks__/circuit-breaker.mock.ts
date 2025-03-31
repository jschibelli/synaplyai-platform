import { jest } from '@jest/globals';

// Define CircuitState enum directly in the mock to avoid circular dependencies
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

// Define a type for executable functions to fix the TypeScript error
type ExecutableFunction = (...args: any[]) => any;

/**
 * Factory function to create a circuit breaker mock
 */
export function createCircuitBreakerMock() {
  return {
    // Fix: Add proper type for the function parameter
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
    // Fix: Add proper type for the function parameter
    executeWithBulkhead: jest.fn().mockImplementation((fn: ExecutableFunction) => fn()),
    serviceName: 'test-service',
    transitionToState: jest.fn().mockImplementation(() => Promise.resolve())
  };
}

// Create a pre-initialized instance that can be imported directly
export const circuitBreakerMock = createCircuitBreakerMock();

// Export the mock type for use in tests
export type MockCircuitBreaker = ReturnType<typeof createCircuitBreakerMock>;

// Default export for backwards compatibility
export default circuitBreakerMock;