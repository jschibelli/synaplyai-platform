// src/metrics/interfaces.ts
import { CircuitState } from '../circuit-breaker/interfaces';
import { ContentFilterResult } from '../filtering/interfaces';

export enum TimeGranularity {
  MINUTE = 'minute',
  HOUR = 'hour',
  DAY = 'day'
}

export interface MetricsCollector {
  // Circuit breaker metrics
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  
  // Content filtering metrics
  incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void>;
  recordFilterLatency(filterName: string, latencyMs: number): Promise<void>;
  recordPipelineLatency(latencyMs: number): Promise<void>;
  incrementPipelineResult(result: ContentFilterResult): Promise<void>;
  incrementPipelineErrors(): Promise<void>;
  
  // Custom metrics
  incrementCounter(name: string, tags?: Record<string, string>): Promise<void>;
  recordValue(name: string, value: number, tags?: Record<string, string>): Promise<void>;
  
  // Retrieve metrics
  getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null>;
  getFilterResultCounts(filterName: string, timeWindow: TimeGranularity): Promise<Record<ContentFilterResult, number>>;
  getPipelineLatency(percentile: number, timeWindow: TimeGranularity): Promise<number | null>;
}