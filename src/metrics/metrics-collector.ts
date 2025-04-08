import { CircuitState } from '../resilience/CircuitBreaker';

// Interface for metrics collection
export interface MetricsCollector {
  recordValue(metricName: string, value: number, tags?: Record<string, string>): void;
  recordLatency(metricName: string, duration: number, tags?: Record<string, string>): void;
  increment(metricName: string, tags?: Record<string, string>): void;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): void;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): void;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): void;
}

// Implementation for metrics collection in production
class ProductionMetricsCollector implements MetricsCollector {
  // Record a metric value
  recordValue(metricName: string, value: number, tags: Record<string, string> = {}): void {
    try {
      console.log(`[Metrics] ${metricName}: ${value}`, tags);
      // Real implementation would send to metrics service
    } catch (error) {
      console.error('Error recording metric value:', error);
    }
  }

  // Record latency measurement
  recordLatency(metricName: string, duration: number, tags: Record<string, string> = {}): void {
    try {
      console.log(`[Latency] ${metricName}: ${duration}ms`, tags);
      // Real implementation would send to metrics service
    } catch (error) {
      console.error('Error recording latency metric:', error);
    }
  }

  // Increment counter
  increment(metricName: string, tags: Record<string, string> = {}): void {
    try {
      console.log(`[Counter] ${metricName}: +1`, tags);
      // Real implementation would send to metrics service
    } catch (error) {
      console.error('Error incrementing metric:', error);
    }
  }

  // Record circuit breaker state change
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): void {
    try {
      const tags = { tenantId, serviceName, state };
      console.log(`[CircuitBreaker] State: ${state}`, tags);
      // Real implementation would send to metrics service
    } catch (error) {
      console.error('Error recording circuit breaker state:', error);
    }
  }

  // Increment circuit breaker rejections
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): void {
    try {
      const tags = { tenantId, serviceName };
      console.log(`[CircuitBreaker] Rejections: +1`, tags);
      // Real implementation would send to metrics service
    } catch (error) {
      console.error('Error incrementing circuit breaker rejections:', error);
    }
  }

  // Increment circuit breaker failures
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): void {
    try {
      const tags = { tenantId, serviceName };
      console.log(`[CircuitBreaker] Failures: +1`, tags);
      // Real implementation would send to metrics service
    } catch (error) {
      console.error('Error incrementing circuit breaker failures:', error);
    }
  }
}

// Singleton instance
export const metricsCollector: MetricsCollector = new ProductionMetricsCollector();