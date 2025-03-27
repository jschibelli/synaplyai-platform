import { MetricsCollector } from '../types/shared-interfaces';
import { CircuitState } from '../lib/circuit-breaker';
import { createTypedMock } from './jest-mock-extensions';

export interface AIAnalysisResult {
  content: string;
  modelId: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, any>;
}

/**
 * Creates a standardized metrics collector mock with all required methods
 */
export function createMetricsCollectorMock() {
  return {
    // Core metrics methods
    increment: jest.fn().mockResolvedValue(undefined),
    incrementCounter: jest.fn().mockResolvedValue(undefined), // For backward compatibility
    recordLatency: jest.fn().mockResolvedValue(undefined),
    recordValue: jest.fn().mockResolvedValue(undefined),
    track: jest.fn().mockResolvedValue(undefined),
    
    // Circuit breaker methods
    setCircuitBreakerState: createTypedMock().mockResolvedValue(undefined),
    getCircuitBreakerState: createTypedMock().mockResolvedValue(CircuitState.CLOSED),
    incrementCircuitBreakerFailures: createTypedMock().mockResolvedValue(undefined),
    incrementCircuitBreakerRejections: createTypedMock().mockResolvedValue(undefined),
    
    // Filter pipeline methods
    incrementFilterResult: createTypedMock().mockResolvedValue(undefined),
    recordFilterLatency: createTypedMock().mockResolvedValue(undefined),
    recordPipelineLatency: createTypedMock().mockResolvedValue(undefined),
    incrementPipelineResult: createTypedMock().mockResolvedValue(undefined),
    incrementPipelineErrors: createTypedMock().mockResolvedValue(undefined),
    
    // Usage tracking
    trackIdentifier: createTypedMock().mockResolvedValue(undefined),
    trackEvent: createTypedMock().mockResolvedValue(undefined),
    trackValue: createTypedMock().mockResolvedValue(undefined),
    
    // Query methods
    getFilterResults: createTypedMock().mockResolvedValue({
      BLOCKED: 0,
      ALLOWED: 0,
      FLAGGED: 0
    }),
    getPercentileLatency: createTypedMock().mockResolvedValue(100),
    getAverageValue: jest.fn().mockResolvedValue(50),
    getCounter: jest.fn().mockResolvedValue(10),
    getCountValue: jest.fn().mockResolvedValue(5),
    getPipelineLatency: jest.fn().mockResolvedValue(100),
    reset: jest.fn().mockResolvedValue(undefined),
    metrics: {},
    redisClient: {}
  };
}

export const metricsCollectorMock = createMetricsCollectorMock();