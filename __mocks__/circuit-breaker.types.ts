import { CircuitState } from '../src/lib/circuit-breaker';

/**
 * Interface for the circuit breaker mock
 */
export interface MockCircuitBreaker {
  execute: jest.Mock;
  getState: jest.Mock;
  setState?: jest.Mock;
  incrementFailures?: jest.Mock;
  incrementSuccesses?: jest.Mock;
  resetCounters?: jest.Mock;
  isOpen?: jest.Mock;
  isClosed?: jest.Mock;
  isHalfOpen?: jest.Mock;
  openCircuit?: jest.Mock;
  closeCircuit?: jest.Mock;
  halfOpenCircuit?: jest.Mock;
  getFailureCount?: jest.Mock;
  getSuccessCount?: jest.Mock;
  transitionState?: jest.Mock;
  recordFailure: jest.Mock;
  recordSuccess: jest.Mock;
  shouldAttemptReset: jest.Mock;
}