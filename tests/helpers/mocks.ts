import { MetricsCollector } from '../../src/services/metrics/MetricsCollector';
import { CircuitBreaker } from '../../src/circuit-breaker/CircuitBreaker';
import { CircuitState } from '../../src/circuit-breaker/interfaces';

/**
 * Creates a consistent mock for MetricsCollector
 */
export function createMockMetricsCollector() {
  return {
    metrics: {},
    redisClient: {} as any,
    increment: jest.fn().mockResolvedValue(undefined),
    recordLatency: jest.fn().mockResolvedValue(undefined),
    incrementCounter: jest.fn().mockResolvedValue(undefined),
    decrementCounter: jest.fn().mockResolvedValue(undefined),
    getCounter: jest.fn().mockResolvedValue(0),
    recordValue: jest.fn().mockResolvedValue(undefined),
    getAverageValue: jest.fn().mockResolvedValue(0),
    getCountValue: jest.fn().mockResolvedValue(0),
    formatKey: jest.fn().mockReturnValue('formatted-key'),
    track: jest.fn().mockResolvedValue(undefined),
    setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
    getCircuitBreakerState: jest.fn().mockResolvedValue('CLOSED'),
    incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
    incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
    getFilterResultCounts: jest.fn().mockResolvedValue({}),
    getPipelineLatency: jest.fn().mockResolvedValue(0)
  };
}

/**
 * Creates a consistent mock for CircuitBreaker
 */
export function createMockCircuitBreaker() {
  return {
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    lastStateChange: Date.now(),
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn().mockImplementation(fn => fn()),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    getState: jest.fn().mockResolvedValue('CLOSED'),
    reset: jest.fn().mockResolvedValue(undefined),
    transitionState: jest.fn().mockResolvedValue(undefined),
    shouldAttemptReset: jest.fn().mockReturnValue(false),
    options: {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 30000
    },
    serviceName: 'test-service'
  };
}