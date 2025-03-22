import { CircuitState } from '../circuit-breaker/interfaces';
import { ContentFilterResult } from '../filtering/interfaces';
import { getCurrentTenantId } from '../lib/tenantContext';

// Define a complete RedisMetricsClient interface that matches your implementation
interface RedisMetricsClient {
  incrementCounter(metricName: string, tenantId: string, value?: number): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void>;
  getPercentileLatency(metricName: string, tenantId: string, percentile: number, timeWindowMinutes?: number): Promise<number | null>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void>;
  getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null>;
  recordValue(metricName: string, value: number, tenantId: string): Promise<void>;
  getFilterResultCounts(filterName: string, timeWindow: number, tenantId: string): Promise<Array<{result: string, count: number}>>;
  getPipelineLatency(percentile: number, timeWindow: number, tenantId: string): Promise<number | null>;
  pipeline(): any; // Add this method to the interface
}

export interface IMetricsCollector {
  increment(metricName: string, tenantId: string, value?: number): Promise<void>;
  recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void>;
  getPercentileLatency(metricName: string, tenantId: string, percentile: number): Promise<number | null>;
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null>;
  incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void>;
  recordFilterLatency(filterName: string, latencyMs: number): Promise<void>;
  recordPipelineLatency(latencyMs: number): Promise<void>;
  incrementPipelineResult(result: ContentFilterResult): Promise<void>;
  incrementPipelineErrors(): Promise<void>;
}

export class MetricsCollector implements IMetricsCollector {
  constructor(private redisClient: RedisMetricsClient) {}
  
  async increment(metricName: string, tenantId: string, value = 1): Promise<void> {
    await this.redisClient.incrementCounter(metricName, tenantId, value);
  }
  
  async recordLatency(metricName: string, latencyMs: number, tenantId: string): Promise<void> {
    await this.redisClient.recordLatency(metricName, latencyMs, tenantId);
  }
  
  async getPercentileLatency(metricName: string, tenantId: string, percentile: number): Promise<number | null> {
    return await this.redisClient.getPercentileLatency(metricName, tenantId, percentile, 5);
  }
  
  async setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void> {
    await this.increment(`circuit.state.${state.toLowerCase()}`, tenantId);
    // Add a null check for optional redisClient methods
    if (this.redisClient.setCircuitBreakerState) {
      await this.redisClient.setCircuitBreakerState(tenantId, serviceName, state);
    }
  }
  
  async incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void> {
    await this.increment(`circuit.failure.${serviceName}`, tenantId);
  }
  
  async incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void> {
    await this.increment(`circuit.rejection.${serviceName}`, tenantId);
  }
  
  async getCircuitBreakerState(tenantId: string, serviceName: string): Promise<CircuitState | null> {
    // Add a null check for optional redisClient methods
    if (this.redisClient.getCircuitBreakerState) {
      return await this.redisClient.getCircuitBreakerState(tenantId, serviceName);
    }
    return null;
  }
  
  // Content filtering metrics implementation
  async incrementFilterResult(filterName: string, result: ContentFilterResult): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment(`filter.result.${filterName}.${result}`, tenantId);
  }
  
  async recordFilterLatency(filterName: string, latencyMs: number): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.recordLatency(`filter.latency.${filterName}`, latencyMs, tenantId);
  }
  
  async recordPipelineLatency(latencyMs: number): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.recordLatency('pipeline.latency', latencyMs, tenantId);
  }
  
  async incrementPipelineResult(result: ContentFilterResult): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment(`pipeline.result.${result}`, tenantId);
  }
  
  async incrementPipelineErrors(): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment('pipeline.errors', tenantId);
  }
  
  // Metric aggregation and advanced tracking
  async trackIdentifier(name: string, identifier: string): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    await this.increment(name, tenantId);
  }
  
  async trackEvent(name: string, tags?: Record<string, string | number>): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    
    await this.increment(name, tenantId);
    
    if (tags) {
      for (const [key, value] of Object.entries(tags)) {
        await this.increment(`${name}.${key}.${value}`, tenantId);
      }
    }
  }
  
  async trackValue(name: string, value: number, tags?: Record<string, string | number>): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    
    if (this.redisClient.recordValue) {
      await this.redisClient.recordValue(name, value, tenantId);
    
      if (tags) {
        for (const [key, tagValue] of Object.entries(tags)) {
          await this.redisClient.recordValue(`${name}.${key}.${tagValue}`, value, tenantId);
        }
      }
    }
  }
  
  async getFilterResults(filterName: string, timeWindow: number = 60): Promise<Array<{result: string, count: number}>> {
    const tenantId = getCurrentTenantId() || 'unknown';
    if (this.redisClient.getFilterResultCounts) {
      return await this.redisClient.getFilterResultCounts(filterName, timeWindow, tenantId);
    }
    return [];
  }
  
  async getPipelineLatency(percentile: number = 95, timeWindow: number = 60): Promise<number | null> {
    const tenantId = getCurrentTenantId() || 'unknown';
    if (this.redisClient.getPipelineLatency) {
      return await this.redisClient.getPipelineLatency(percentile, timeWindow, tenantId);
    }
    return null;
  }
}

// Only declare public 'rollingWindows' property in the base class
export class EnhancedMetricsCollector extends MetricsCollector {
  public rollingWindows: number[] = [1, 5, 15, 60]; // 1min, 5min, 15min, 1hour windows
  
  // Implementation details of EnhancedMetricsCollector
  async recordBatchedMetrics(
    metrics: Array<{name: string, value: number, tags?: Record<string, string | number>}>
  ): Promise<void> {
    const tenantId = getCurrentTenantId() || 'unknown';
    
    if (!metrics.length) return;
    
    if (this.redisClient.pipeline) {
      const pipeline = this.redisClient.pipeline();
      
      // Process pipeline methods here
      
      await pipeline.exec();
    } else {
      // Fall back to individual recording if pipeline not available
      for (const metric of metrics) {
        await this.trackValue(metric.name, metric.value, metric.tags);
      }
    }
  }
}