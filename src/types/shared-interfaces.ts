import { CircuitState } from '../lib/circuit-breaker';

/**
 * Shared interface file to ensure consistent types across the application
 */

// Consolidated MetricsCollector interface
export interface IMetricsCollector {
  // Core metrics methods
  increment(metricName: string, tenantId: string, value?: number): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void>;
  getPercentileLatency(metricName: string, tenantId: string, percentile: number): Promise<number | null>;
  
  // Circuit breaker methods
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState | string): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  getCircuitBreakerState?(tenantId: string, serviceName: string): Promise<CircuitState | null>;
  
  // Content filtering methods
  incrementFilterResult?(filterName: string, result: string): Promise<void>;
  recordFilterLatency?(filterName: string, latencyMs: number): Promise<void>;
  recordPipelineLatency?(latencyMs: number): Promise<void>;
  incrementPipelineResult?(result: string): Promise<void>;
  incrementPipelineErrors?(): Promise<void>;
  
  // Additional tracking methods
  recordValue?(metricName: string, value: number, tenantId?: string): Promise<void>;
  getAverageValue?(metricName: string, options?: any): Promise<number>;
  getCountValue?(metricName: string, options?: any): Promise<number>;
  track?(metricName: string, value: number, tags?: Record<string, any>): Promise<void>;
  trackValue?(name: string, value: number, tags?: Record<string, string | number>): Promise<void>;
  reset?(): Promise<void>;
}

// AI Command interfaces
export interface AICommandOptions {
  id?: string | number;
  executionParameters?: {
    timeout?: number;
    retries?: number;
    priority?: 'high' | 'normal' | 'low';
  };
}

export interface DocumentContext {
  documentId: string;
  tenantId?: string;
  userId?: string;
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  documentMetadata?: Record<string, any>;
  getContext?: (parameters: any) => Promise<any>;
  onToken?: (token: string) => void;
}

export interface AIAnalysisResult {
  content: string;        // Was incorrectly referenced as 'text' in tests
  modelId: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, any>;
}

// CircuitBreaker interfaces
export interface ICircuitBreaker {
  execute<T>(command: () => Promise<T>): Promise<T>;
  getState(): Promise<CircuitState>;
  recordSuccess(): Promise<void>;
  recordFailure(error: Error): Promise<void>;
  transitionState(newState: CircuitState): Promise<void>;
  shouldAttemptReset(): boolean;
}

// Content Filtering interfaces
export interface ContentFilterResult {
  result: 'ALLOWED' | 'BLOCKED' | 'FLAGGED';
  confidence: number;
  reason?: string;
}

export interface ContentFilter {
  name: string;
  executionStrategy: 'SYNC' | 'PARALLEL';
  priority: number;
  filter: (content: string) => Promise<ContentFilterResult>;
}

// TenantContext interface
export interface TenantContext {
  tenantId: string;
  userId: string;
  requestId: string;
  traceId?: string;
  features?: Record<string, boolean>;
  roles?: string[];
}

export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;  // Missing in many tests
  trackReferences?: boolean;
  trackCollaborativeChanges?: boolean;
  streamResponse?: boolean;
  validateStructure?: boolean;
  trackUserPresence?: boolean;
  [key: string]: any;  // Allow additional properties
}

// Circuit breaker interfaces
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  successThreshold?: number;
}

export interface CircuitBreakerStore {
  getState(key: string): Promise<CircuitState>;
  setState(key: string, state: CircuitState): Promise<void>;
  incrementFailures(key: string): Promise<number>;
  incrementSuccesses(key: string): Promise<number>;
  resetCounters(key: string): Promise<void>;
  getLastStateChange(key: string): Promise<Date | null>;
  setLastStateChange(key: string, date: Date): Promise<void>;
}

// Metrics collector interface
export interface MetricsCollector {
  increment(metricName: string, tenantId: string, value?: number): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void>;
  recordValue(metricName: string, value: number, tenantId?: string): Promise<void>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: string | CircuitState): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
}