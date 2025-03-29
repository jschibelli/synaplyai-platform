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