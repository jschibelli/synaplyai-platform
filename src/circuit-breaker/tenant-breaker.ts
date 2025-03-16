// src/circuit-breaker/tenant-breaker.ts
import { EventEmitter } from 'events';
import { CircuitBreaker, CircuitBreakerOptions, CircuitBreakerStore, CircuitState } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/collector';

export class TenantAwareCircuitBreaker implements CircuitBreaker {
  private store: CircuitBreakerStore;
  private tenantId: string;
  private serviceName: string;
  private options: CircuitBreakerOptions;
  private metrics: MetricsCollector;
  private eventEmitter: EventEmitter;
  
  constructor(
    store: CircuitBreakerStore,
    tenantId: string,
    serviceName: string,
    metrics: MetricsCollector,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    this.store = store;
    this.tenantId = tenantId;
    this.serviceName = serviceName;
    this.metrics = metrics;
    this.eventEmitter = new EventEmitter();
    
    // Default options with overrides
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      successThreshold: options.successThreshold || 2,
      resetTimeoutMs: options.resetTimeoutMs || 30000,
      monitorIntervalMs: options.monitorIntervalMs || 5000
    };
  }
  
  private get circuitKey(): string {
    return `${this.tenantId}:${this.serviceName}`;
  }
  
  async getState(): Promise<CircuitState> {
    return this.store.getState(this.circuitKey);
  }
  
  async reset(): Promise<void> {
    await this.store.setState(this.circuitKey, CircuitState.CLOSED);
    await this.store.resetCounters(this.circuitKey);
    await this.store.setLastStateChange(this.circuitKey, new Date());
    
    this.eventEmitter.emit('circuitReset', {
      tenantId: this.tenantId,
      serviceName: this.serviceName,
      state: CircuitState.CLOSED,
      timestamp: new Date()
    });
    
    await ComplianceLogger.log({
      eventType: 'circuit.reset',
      resourceId: this.serviceName,
      description: `Circuit breaker reset for service: ${this.serviceName}`,
      metadata: { tenantId: this.tenantId }
    });
    
    // Update metrics
    this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.CLOSED);
  }
  
  async execute<T>(command: () => Promise<T>): Promise<T> {
    const currentState = await this.getState();
    
    // If circuit is open, fail fast
    if (currentState === CircuitState.OPEN) {
      const lastChange = await this.store.getLastStateChange(this.circuitKey);
      const now = new Date();
      
      // Check if it's time to try again (half-open)
      if (lastChange && (now.getTime() - lastChange.getTime()) >= this.options.resetTimeoutMs) {
        await this.store.setState(this.circuitKey, CircuitState.HALF_OPEN);
        await this.store.setLastStateChange(this.circuitKey, now);
        
        this.eventEmitter.emit('circuitStateChanged', {
          tenantId: this.tenantId,
          serviceName: this.serviceName,
          state: CircuitState.HALF_OPEN,
          timestamp: now
        });
        
        await ComplianceLogger.log({
          eventType: 'circuit.half_open',
          resourceId: this.serviceName,
          description: `Circuit breaker half-opened for service: ${this.serviceName}`,
          metadata: { tenantId: this.tenantId }
        });
        
        // Update metrics
        this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.HALF_OPEN);
      } else {
        // Circuit is still open, throw error
        this.metrics.incrementCircuitBreakerRejections(this.tenantId, this.serviceName);
        
        throw new Error(`Circuit for ${this.serviceName} is OPEN for tenant ${this.tenantId}`);
      }
    }
    
    try {
      // Attempt to execute the command
      const result = await command();
      
      // Command succeeded
      if (currentState === CircuitState.HALF_OPEN) {
        // In half-open state, increment success counter
        const successes = await this.store.incrementSuccesses(this.circuitKey);
        
        if (successes >= this.options.successThreshold) {
          // Enough successes, close the circuit
          await this.store.setState(this.circuitKey, CircuitState.CLOSED);
          await this.store.resetCounters(this.circuitKey);
          await this.store.setLastStateChange(this.circuitKey, new Date());
          
          this.eventEmitter.emit('circuitStateChanged', {
            tenantId: this.tenantId,
            serviceName: this.serviceName,
            state: CircuitState.CLOSED,
            timestamp: new Date()
          });
          
          await ComplianceLogger.log({
            eventType: 'circuit.closed',
            resourceId: this.serviceName,
            description: `Circuit breaker closed for service: ${this.serviceName}`,
            metadata: { tenantId: this.tenantId, successes }
          });
          
          // Update metrics
          this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.CLOSED);
        }
      } else {
        // In closed state, reset failure counter on success
        await this.store.resetCounters(this.circuitKey);
      }
      
      return result;
    } catch (error) {
      // Command failed
      if (currentState === CircuitState.HALF_OPEN) {
        // In half-open state, immediately open the circuit again
        await this.store.setState(this.circuitKey, CircuitState.OPEN);
        await this.store.resetCounters(this.circuitKey);
        await this.store.setLastStateChange(this.circuitKey, new Date());
        
        this.eventEmitter.emit('circuitStateChanged', {
          tenantId: this.tenantId,
          serviceName: this.serviceName,
          state: CircuitState.OPEN,
          timestamp: new Date()
        });
        
        await ComplianceLogger.log({
          eventType: 'circuit.opened',
          resourceId: this.serviceName,
          description: `Circuit breaker opened for service: ${this.serviceName}`,
          metadata: { tenantId: this.tenantId, error: error.message }
        });
        
        // Update metrics
        this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.OPEN);
      } else {
        // In closed state, increment failure counter
        const failures = await this.store.incrementFailures(this.circuitKey);
        
        // Record the failure in metrics
        this.metrics.incrementCircuitBreakerFailures(this.tenantId, this.serviceName);
        
        if (failures >= this.options.failureThreshold) {
          // Too many failures, open the circuit
          await this.store.setState(this.circuitKey, CircuitState.OPEN);
          await this.store.setLastStateChange(this.circuitKey, new Date());
          
          this.eventEmitter.emit('circuitStateChanged', {
            tenantId: this.tenantId,
            serviceName: this.serviceName,
            state: CircuitState.OPEN,
            timestamp: new Date()
          });
          
          await ComplianceLogger.log({
            eventType: 'circuit.opened',
            resourceId: this.serviceName,
            description: `Circuit breaker opened for service: ${this.serviceName}`,
            metadata: { tenantId: this.tenantId, failures, error: error.message }
          });
          
          // Update metrics
          this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.OPEN);
        }
      }
      
      // Rethrow the error
      throw error;
    }
  }
  
  on(event: string, listener: (...args: any[]) => void): this {
    this.eventEmitter.on(event, listener);
    return this;
  }
}