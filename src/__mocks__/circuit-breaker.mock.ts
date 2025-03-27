import { createTypedMock } from './jest-mock-extensions';
import { CircuitState } from '../lib/circuit-breaker';

export function createCircuitBreakerMock() {
  return {
    execute: createTypedMock().mockImplementation(async (fn) => {
      return await fn();
    }),
    
    executeWithBulkhead: createTypedMock().mockImplementation(async (fn) => {
      return await fn();
    }),
    
    getState: createTypedMock().mockResolvedValue(CircuitState.CLOSED),
    
    recordSuccess: createTypedMock().mockResolvedValue(undefined),
    
    recordFailure: createTypedMock().mockResolvedValue(undefined),
    
    transitionState: createTypedMock().mockResolvedValue(undefined),
    
    shouldAttemptReset: createTypedMock().mockReturnValue(false),
    
    options: {
      failureThreshold: 3,
      failureWindow: 60000,
      resetTimeout: 30000,
      bulkheadLimit: 10
    },
    
    serviceName: 'mock-service'
  };
}

export const circuitBreakerMock = createCircuitBreakerMock();