import { jest } from '@jest/globals';

/**
 * Interface for the metrics collector mock
 */
export interface MetricsCollectorMock {
  metrics: any;
  redisClient: any;
  increment: any;
  recordLatency: any;
  incrementCounter: any;
  decrementCounter: any;
  getCounter: any;
  recordValue: any;
  getAverageValue: any;
  getCountValue: any;
  formatKey: any;
  track: any;
  setCircuitBreakerState: any;
  getCircuitBreakerState: any;
  incrementCircuitBreakerFailures: any;
  incrementCircuitBreakerRejections: any;
  getFilterResultCounts: any;
  getPercentileLatency: any;
  getPipelineLatency: any;
}

/**
 * Creates a mock metrics collector for testing
 */
export function createMetricsCollectorMock(): MetricsCollectorMock {
  // The key fix: Create the mock functions with explicit implementations right away
  // instead of creating them first and then setting implementations
  return {
    metrics: {},
    redisClient: {} as any,
    increment: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    recordLatency: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    incrementCounter: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    decrementCounter: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    getCounter: jest.fn().mockImplementation(() => Promise.resolve(0)),
    recordValue: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    getAverageValue: jest.fn().mockImplementation(() => Promise.resolve(0)),
    getCountValue: jest.fn().mockImplementation(() => Promise.resolve(0)),
    formatKey: jest.fn().mockImplementation(() => 'formatted-key'),
    track: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    setCircuitBreakerState: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    getCircuitBreakerState: jest.fn().mockImplementation(() => Promise.resolve('CLOSED')),
    incrementCircuitBreakerFailures: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    incrementCircuitBreakerRejections: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
    getFilterResultCounts: jest.fn().mockImplementation(() => Promise.resolve({})),
    getPercentileLatency: jest.fn().mockImplementation(() => Promise.resolve(0)),
    getPipelineLatency: jest.fn().mockImplementation(() => Promise.resolve(0))
  };
}

// Create a singleton instance for direct imports
export const metricsCollectorMock = createMetricsCollectorMock();

export default metricsCollectorMock;