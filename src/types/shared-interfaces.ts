import { CircuitState } from '../lib/circuit-breaker';

/**
 * Shared interface file to ensure consistent types across the application
 */

// Consolidated MetricsCollector interface
export interface IMetricsCollector {
  increment(metric: string, tags?: Record<string, string>): Promise<void>;
  incrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  decrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  recordLatency(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  recordValue(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  getCounter(metric: string, tags?: Record<string, string>): Promise<number>;
  getAverageValue(metric: string, tags?: Record<string, string>): Promise<number>;
  track(eventName: string, properties?: Record<string, any>): Promise<void>;
}

// AI Command interfaces
export interface AICommandOptions {
  type: string;
  contextParameters?: AICommandContextParameters;
  executionParameters?: {
    timeout?: number;
    retries?: number;
    retryDelay?: number;
    priority?: 'high' | 'normal' | 'low';
    cleanupRequired?: boolean;
    rateLimit?: {
      maxRequests: number;
      perTimeWindow: number;
    };
  };
  requiresAIAnalysis: boolean;
}

export interface DocumentContext {
  documentId: string;
  content: string;
  userId: string;
  tenantId: string;
  position?: number;
  selection?: {
    start: number;
    end: number;
    text: string;
  };
  metadata?: Record<string, any>;
  formatting?: Record<string, any>;
}

export interface AIAnalysisResult {
  content: string;
  modelId?: string;
  tokenUsage?: {
    prompt: number;
    completion: number;
    total: number;
  };
  metadata?: Record<string, any>;
  cleanup?: () => Promise<void>;
}

// CircuitBreaker interfaces
export interface ICircuitBreaker {
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastStateChange: number;
  serviceName: string;
  
  execute<T>(fn: () => Promise<T>): Promise<T>;
  executeWithBulkhead<T>(fn: () => Promise<T>, concurrencyLimit: number): Promise<T>;
  transitionToState(newState: CircuitState): Promise<void>;
  getState(): Promise<CircuitState>;
  recordSuccess(): Promise<void>;
  recordFailure(): Promise<void>;
  shouldAttemptReset(): Promise<boolean>;
}

// Content Filtering interfaces
export interface ContentFilterResult {
  result: 'ALLOWED' | 'BLOCKED' | 'FLAGGED';
  confidence: number;
  reason?: string;
}

export interface ContentFilter {
  name: string;
  filter(content: string): Promise<ContentFilterResult>;
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
  includeDocument: boolean;
  trackReferences?: boolean;
  trackCollaborativeChanges?: boolean;
  streamResponse?: boolean;
  validateStructure?: boolean;
  trackUserPresence?: boolean;
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
  incrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  decrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
}

// Metrics collector interface
export interface MetricsCollector {
  increment(metric: string, tags?: Record<string, string>): Promise<void>;
  incrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  decrementCounter(key: string, tags?: Record<string, string>): Promise<number>;
  recordLatency(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  recordValue(metric: string, value: number, tags?: Record<string, string>): Promise<void>;
  getCounter(metric: string, tags?: Record<string, string>): Promise<number>;
  getAverageValue(metric: string, tags?: Record<string, string>): Promise<number>;
  track(eventName: string, properties?: Record<string, any>): Promise<void>;
}