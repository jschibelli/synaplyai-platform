import { CircuitState } from './src/lib/circuit-breaker';
import prisma from './__mocks__/prisma.mock';

// Add types to globals
declare global {
  var mockMetricsCollector: {
    increment: jest.Mock;
    recordLatency: jest.Mock;
    recordValue: jest.Mock;
    track: jest.Mock;
    incrementCounter: jest.Mock;
    getAverageValue: jest.Mock;
    getPercentileLatency: jest.Mock;
  };
  
  var mockCircuitBreaker: {
    execute: jest.Mock;
    executeWithBulkhead: jest.Mock;
    getState: jest.Mock;
    recordSuccess: jest.Mock;
    recordFailure: jest.Mock;
    transitionState: jest.Mock;
    shouldAttemptReset: jest.Mock;
    options: { failureThreshold: number; resetTimeout: number };
    serviceName: string;
  };
}

// Create standardized mocks for all commonly used interfaces
global.mockMetricsCollector = {
  increment: jest.fn().mockResolvedValue(undefined),
  recordLatency: jest.fn().mockResolvedValue(undefined),
  recordValue: jest.fn().mockResolvedValue(undefined),
  track: jest.fn().mockResolvedValue(undefined),
  incrementCounter: jest.fn().mockResolvedValue(undefined),
  getAverageValue: jest.fn().mockResolvedValue(0),
  getPercentileLatency: jest.fn().mockResolvedValue(0)
};

global.mockCircuitBreaker = {
  execute: jest.fn().mockImplementation(fn => fn()),
  executeWithBulkhead: jest.fn().mockImplementation(fn => fn()),
  getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined),
  transitionState: jest.fn().mockResolvedValue(undefined),
  shouldAttemptReset: jest.fn().mockReturnValue(false),
  options: {
    failureThreshold: 5,
    resetTimeout: 30000
  },
  serviceName: 'test-service'
};

// Mock PrismaClient
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma)
}));

// Add to jest.config.js:
// setupFilesAfterEnv: ['./jest.setup-mocks.ts']