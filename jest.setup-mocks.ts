import { CircuitState } from './src/lib/circuit-breaker';

// Create standardized mocks for all commonly used interfaces
global.mockMetricsCollector = {
  increment: jest.fn().mockResolvedValue(undefined),
  recordLatency: jest.fn().mockResolvedValue(undefined),
  recordValue: jest.fn().mockResolvedValue(undefined),
  track: jest.fn().mockResolvedValue(undefined),
  // Add all methods tests expect
};

global.mockCircuitBreaker = {
  execute: jest.fn().mockImplementation(fn => fn()),
  getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined),
  // Other methods
};

// Add to jest.config.js:
// setupFilesAfterEnv: ['./jest.setup-mocks.ts']