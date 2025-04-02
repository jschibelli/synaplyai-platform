import { CircuitState } from '../lib/circuit-breaker';
import { Mock } from 'jest-mock';

/**
 * Interface for the circuit breaker mock
 */
export interface MockCircuitBreaker {
  execute: Mock<any>;
  getState: Mock<any>;
  setState: Mock<any>;
  incrementFailures: Mock<any>;
  incrementSuccesses: Mock<any>;
  resetCounters: Mock<any>;
  isOpen: Mock<any>;
  isClosed: Mock<any>;
  isHalfOpen: Mock<any>;
  openCircuit: Mock<any>;
  closeCircuit: Mock<any>;
  halfOpenCircuit: Mock<any>;
  getFailureCount: Mock<any>;
  getSuccessCount: Mock<any>;
  transitionToState: Mock<any>;
  recordFailure: Mock<any>;
  recordSuccess: Mock<any>;
  shouldAttemptReset: Mock<any>;
  // Add any other methods used in your tests
}