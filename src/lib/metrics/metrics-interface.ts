// Create a shared interface file for metrics

export interface MetricsCollector {
  increment(metricName: string, tenantId: string, value?: number): Promise<void>;
  incrementCounter(metricName: string, tags?: Record<string, any>): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId?: string): Promise<void>;
  recordValue(metricName: string, value: number, tags?: Record<string, any>): Promise<void>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: string | any): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  getCircuitBreakerState?(tenantId: string, serviceName: string): Promise<any>;
}