import { MetricsCollector } from '../metrics/metrics-collector';

export const createMetricsCollectorMock = () => ({
  increment: jest.fn().mockResolvedValue(undefined),
  incrementCounter: jest.fn().mockResolvedValue(undefined),
  recordLatency: jest.fn().mockResolvedValue(undefined),
  recordValue: jest.fn().mockResolvedValue(undefined),
  getPercentileLatency: jest.fn().mockResolvedValue(42),
  setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
  getCircuitBreakerState: jest.fn().mockResolvedValue('CLOSED'),
  incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
  incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
  incrementFilterResult: jest.fn().mockResolvedValue(undefined),
  recordFilterLatency: jest.fn().mockResolvedValue(undefined),
  recordPipelineLatency: jest.fn().mockResolvedValue(undefined),
  incrementPipelineResult: jest.fn().mockResolvedValue(undefined),
  incrementPipelineErrors: jest.fn().mockResolvedValue(undefined),
  trackIdentifier: jest.fn().mockResolvedValue(undefined),
  trackEvent: jest.fn().mockResolvedValue(undefined),
  trackValue: jest.fn().mockResolvedValue(undefined),
  getFilterResults: jest.fn().mockResolvedValue([]),
  getPipelineLatency: jest.fn().mockResolvedValue(42),
  track: jest.fn().mockResolvedValue(undefined),
  getAverageValue: jest.fn().mockResolvedValue(42),
  getCountValue: jest.fn().mockResolvedValue(10),
  reset: jest.fn().mockResolvedValue(undefined)
});

export const metricsCollectorMock = createMetricsCollectorMock();