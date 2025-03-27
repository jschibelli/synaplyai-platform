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
    increment: createTypedMock().mockResolvedValue(undefined),
    recordLatency: createTypedMock().mockResolvedValue(undefined),
    recordValue: createTypedMock().mockResolvedValue(undefined),
    track: createTypedMock().mockResolvedValue(undefined),
    
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
    getAverageValue: createTypedMock().mockResolvedValue(50),
    getCountValue: createTypedMock().mockResolvedValue(10)
  };
}

export const metricsCollectorMock = createMetricsCollectorMock();