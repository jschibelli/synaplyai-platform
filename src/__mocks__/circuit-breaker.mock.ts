import { createTypedMock } from './jest-mock-extensions';
import { CircuitState } from '../lib/circuit-breaker';

export function createCircuitBreakerMock() {
  return {
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn(),
    getState: jest.fn().mockReturnValue('CLOSED'),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    transitionState: jest.fn(),
    shouldAttemptReset: jest.fn(),
    options: { failureThreshold: 5, resetTimeout: 30000 },
    serviceName: 'test-service'
  };
}

export const circuitBreakerMock = createCircuitBreakerMock();