import { CircuitState, CircuitBreakerInterface } from '../src/lib/circuit-breaker';

export function createCircuitBreakerMock(): CircuitBreakerInterface {
  return {
    state: CircuitState.CLOSED,
    failureCount: 0,
    successCount: 0,
    lastStateChange: Date.now(),
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn().mockImplementation((fn, concurrencyLimit = 10) => fn()),
    serviceName: 'test-service',
    transitionToState: jest.fn().mockResolvedValue(undefined)
  };
}

export const circuitBreakerMock = createCircuitBreakerMock();