import { EventEmitter } from 'events';
import { CircuitBreakerOptions, CircuitBreakerStore, CircuitState } from './interfaces';
import { TenantAwareCircuitBreaker } from './tenant-breaker';
import { MetricsCollector } from '../metrics/collector';
import { ComplianceLogger } from '../compliance/logger';

export class AdaptiveCircuitBreaker extends TenantAwareCircuitBreaker {
  private static readonly SAMPLE_WINDOW = 100; // Number of requests to consider for adaptation
  private static readonly MIN_THRESHOLD = 2;   // Minimum failure threshold
  private static readonly MAX_THRESHOLD = 15;  // Maximum failure threshold
  
  private errorRates: number[] = [];           // Array tracking recent errors (1) and successes (0)
  private latencies: number[] = [];            // Array tracking recent latency values
  private adaptationInterval: NodeJS.Timeout | null = null;

  constructor(
    store: CircuitBreakerStore,
    tenantId: string,
    serviceName: string,
    metrics: MetricsCollector,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    super(store, tenantId, serviceName, metrics, options);

    // Start adaptive monitoring if monitoring interval is set
    if (this.options.monitorIntervalMs) {
      this.startAdaptiveMonitoring();
    }
  }

  /**
   * Start adaptive monitoring to periodically adjust thresholds
   */
  private startAdaptiveMonitoring(): void {
    this.adaptationInterval = setInterval(() => {
      this.updateThresholds();
    }, this.options.monitorIntervalMs);
    
    // Ensure the process isn't kept alive just for this timer
    if (this.adaptationInterval.unref) {
      this.adaptationInterval.unref();
    }
  }

  /**
   * Stop adaptive monitoring
   */
  stopAdaptiveMonitoring(): void {
    if (this.adaptationInterval) {
      clearInterval(this.adaptationInterval);
      this.adaptationInterval = null;
    }
  }

  /**
   * Override execute to track error rates and latencies
   */
  async execute<T>(command: () => Promise<T>): Promise<T> {
    // Update thresholds based on recent performance
    await this.updateThresholds();
    
    const startTime = performance.now();
    
    try {
      // Call the parent class implementation
      const result = await super.execute(command);
      
      // Record success (0) in the error rates array
      this.errorRates.push(0);
      if (this.errorRates.length > AdaptiveCircuitBreaker.SAMPLE_WINDOW) {
        this.errorRates.shift();
      }
      
      // Record latency
      const latency = performance.now() - startTime;
      this.latencies.push(latency);
      if (this.latencies.length > AdaptiveCircuitBreaker.SAMPLE_WINDOW) {
        this.latencies.shift();
      }
      
      return result;
    } catch (error) {
      // Record failure (1) in the error rates array
      this.errorRates.push(1);
      if (this.errorRates.length > AdaptiveCircuitBreaker.SAMPLE_WINDOW) {
        this.errorRates.shift();
      }
      
      // Record latency even on failure
      const latency = performance.now() - startTime;
      this.latencies.push(latency);
      if (this.latencies.length > AdaptiveCircuitBreaker.SAMPLE_WINDOW) {
        this.latencies.shift();
      }
      
      throw error;
    }
  }

  /**
   * Dynamically adjust circuit breaker thresholds based on observed performance
   */
  private async updateThresholds(): Promise<void> {
    // Skip adjustment if not enough data points
    if (this.errorRates.length < 10) return;

    // Calculate error rate (0-1)
    const errorRate = this.errorRates.reduce((sum, val) => sum + val, 0) / this.errorRates.length;
    
    // Calculate p95 latency
    const sortedLatencies = [...this.latencies].sort((a, b) => a - b);
    const p95Index = Math.floor(sortedLatencies.length * 0.95);
    const p95Latency = sortedLatencies[p95Index] || 0;

    // Log current adaptive metrics
    await ComplianceLogger.log({
      eventType: 'circuit.adaptive.metrics',
      resourceId: this.serviceName,
      description: `Adaptive circuit breaker metrics for service: ${this.serviceName}`,
      metadata: { 
        tenantId: this.tenantId,
        errorRate,
        p95Latency,
        currentFailureThreshold: this.options.failureThreshold,
        currentSuccessThreshold: this.options.successThreshold
      }
    });

    // Adjust failure threshold based on error rate
    let newFailureThreshold = this.options.failureThreshold;
    
    if (errorRate > 0.05) {
      // Higher error rate, make the circuit more sensitive (lower threshold)
      newFailureThreshold = Math.max(
        AdaptiveCircuitBreaker.MIN_THRESHOLD,
        this.options.failureThreshold - 1
      );
    } else if (errorRate < 0.01 && p95Latency < 500) {
      // Low error rate and good latency, make the circuit less sensitive (higher threshold)
      newFailureThreshold = Math.min(
        AdaptiveCircuitBreaker.MAX_THRESHOLD,
        this.options.failureThreshold + 1
      );
    }
    
    // If threshold changed, log and update
    if (newFailureThreshold !== this.options.failureThreshold) {
      this.options.failureThreshold = newFailureThreshold;
      
      await ComplianceLogger.log({
        eventType: 'circuit.adaptive.threshold',
        resourceId: this.serviceName,
        description: `Circuit breaker threshold adapted for service: ${this.serviceName}`,
        metadata: { 
          tenantId: this.tenantId,
          newFailureThreshold,
          errorRate,
          p95Latency
        }
      });
    }
  }
  
  /**
   * Implement bulkhead pattern to limit concurrent executions
   */
  async executeWithBulkhead<T>(
    command: () => Promise<T>, 
    concurrencyLimit: number = 10
  ): Promise<T> {
    const concurrencyKey = `${this.tenantId}:${this.serviceName}:concurrency`;
    const store = this.getStore();
    
    // Increment concurrency counter
    const currentConcurrency = await store.incrementCounter(concurrencyKey);
    
    try {
      // Check if we're over the limit
      if (currentConcurrency > concurrencyLimit) {
        this.metrics.incrementCounter('circuit.bulkhead.rejections', {
          tenantId: this.tenantId,
          service: this.serviceName
        });
        
        throw new Error(`Bulkhead limit reached for service ${this.serviceName}`);
      }
      
      // Execute with normal circuit breaking logic
      return await this.execute(command);
    } finally {
      // Decrement concurrency counter
      await store.decrementCounter(concurrencyKey);
    }
  }
  
  // Expose store for bulkhead implementation
  private getStore(): CircuitBreakerStore {
    return (this as any).store;
  }
}