// filepath: src/__mocks__/circuit-breaker.mock.ts
import { CircuitBreaker, CircuitState } from '../lib/circuit-breaker';

export interface MockCircuitBreaker extends CircuitBreaker {
  // Mock-specific methods
  mockReset(): void;
  mockCalls(): Record<string, any[][]>;
}

export const createCircuitBreakerMock = jest.fn(() => circuitBreakerMock);

export const circuitBreakerMock: MockCircuitBreaker = {
  // Implementation of CircuitBreaker interface
  execute: jest.fn(),
  getState: jest.fn(),
  setCircuitState: jest.fn(),
  getSuccessCount: jest.fn(),
  getFailureCount: jest.fn(),
  getRejectCount: jest.fn(),
  
  // Mock-specific methods
  mockReset: jest.fn(),
  mockCalls: jest.fn(),

  // Track calls
  _calls: {
    execute: [],
    setCircuitState: []
  }
};

// Reset before each test
beforeEach(() => {
  circuitBreakerMock.mockReset();
  createCircuitBreakerMock.mockClear();
});