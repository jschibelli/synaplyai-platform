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
    setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
    getCircuitBreakerState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
    incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
    incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
    
    // Filter pipeline methods
    incrementFilterResult: jest.fn().mockResolvedValue(undefined),
    recordFilterLatency: jest.fn().mockResolvedValue(undefined),
    recordPipelineLatency: jest.fn().mockResolvedValue(undefined),
    incrementPipelineResult: jest.fn().mockResolvedValue(undefined),
    incrementPipelineErrors: jest.fn().mockResolvedValue(undefined),
    
    // Usage tracking
    trackIdentifier: jest.fn().mockResolvedValue(undefined),
    trackEvent: jest.fn().mockResolvedValue(undefined),
    trackValue: jest.fn().mockResolvedValue(undefined),
    
    // Query methods
    getFilterResults: jest.fn().mockResolvedValue({
      BLOCKED: 0,
      ALLOWED: 0,
      FLAGGED: 0
    }),
    getPercentileLatency: jest.fn().mockResolvedValue(100),
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