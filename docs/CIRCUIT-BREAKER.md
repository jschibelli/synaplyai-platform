# Tenant-Aware Circuit Breaker Pattern

This document provides detailed information about the implementation of the tenant-aware circuit breaker pattern in the AI Content Creation Platform.

## Overview

Circuit breakers prevent cascading failures by temporarily disabling components that are experiencing issues. Our implementation adds tenant awareness to ensure that problems affecting one tenant don't impact others.

## Architecture

### Circuit States

The circuit breaker operates in three states:

1. **CLOSED**: Normal operation, requests are passed through to the protected service.
2. **OPEN**: Service is unavailable or failing, requests are immediately rejected.
3. **HALF_OPEN**: Testing if the service has recovered by allowing limited requests through.

![Circuit Breaker States](https://via.placeholder.com/800x300?text=Circuit+Breaker+States+Diagram)

### Components

#### 1. TenantAwareCircuitBreaker

The main circuit breaker implementation with tenant isolation.

```typescript
export class TenantAwareCircuitBreaker {
  constructor(
    private store: CircuitBreakerStore,
    private tenantId: string,
    private serviceName: string,
    private metrics: MetricsCollector,
    private options: CircuitBreakerOptions = {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 30000,
      monitorIntervalMs: 5000
    }
  ) {
    this.eventEmitter = new EventEmitter();
  }
  
  private get circuitKey(): string {
    return `${this.tenantId}:${this.serviceName}`;
  }
  
  async execute<T>(command: () => Promise<T>): Promise<T> {
    const state = await this.store.getState(this.circuitKey);
    
    if (state === CircuitState.OPEN) {
      // Check if it's time to retry
      const lastStateChange = await this.store.getLastStateChange(this.circuitKey);
      const now = new Date();
      
      if (lastStateChange && (now.getTime() - lastStateChange.getTime() > this.options.resetTimeoutMs)) {
        // Try again, move to half-open
        await this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        // Circuit is still open
        await this.metrics.incrementCircuitBreakerRejections(this.tenantId, this.serviceName);
        throw new Error(`Circuit breaker is open for service: ${this.serviceName}`);
      }
    }
    
    try {
      // Execute the command
      const startTime = performance.now();
      const result = await command();
      const latency = performance.now() - startTime;
      
      // Record successful latency
      await this.metrics.recordLatency(`circuit.latency.${this.serviceName}`, latency, this.tenantId);
      
      // Handle success in half-open state
      if (state === CircuitState.HALF_OPEN) {
        const successes = await this.store.incrementSuccesses(this.circuitKey);
        
        if (successes >= this.options.successThreshold) {
          // Enough successes, close the circuit
          await this.transitionTo(CircuitState.CLOSED);
          await this.store.resetCounters(this.circuitKey);
        }
      }
      
      return result;
    } catch (err) {
      // Handle failure
      const error = err as Error;
      
      if (state === CircuitState.HALF_OPEN) {
        // Failed in half-open state, open the circuit again
        await this.transitionTo(CircuitState.OPEN);
      } else {
        // In closed state, increment failure counter
        const failures = await this.store.incrementFailures(this.circuitKey);
        
        // Record the failure in metrics
        await this.metrics.incrementCircuitBreakerFailures(this.tenantId, this.serviceName);
        
        if (failures >= this.options.failureThreshold) {
          // Too many failures, open the circuit
          await this.transitionTo(CircuitState.OPEN);
        }
      }
      
      throw err;
    }
  }
  
  private async transitionTo(state: CircuitState): Promise<void> {
    await this.store.setState(this.circuitKey, state);
    await this.store.setLastStateChange(this.circuitKey, new Date());
    
    this.eventEmitter.emit('circuitStateChanged', {
      tenantId: this.tenantId,
      serviceName: this.serviceName,
      state,
      timestamp: new Date()
    });
    
    // Log the state change for compliance
    await ComplianceLogger.log({
      eventType: `circuit.${state.toLowerCase()}`,
      resourceId: this.serviceName,
      description: `Circuit breaker ${state.toLowerCase()} for service: ${this.serviceName}`,
      metadata: { tenantId: this.tenantId }
    });
    
    // Update metrics
    await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, state);
  }
  
  async reset(): Promise<void> {
    await this.store.resetCounters(this.circuitKey);
    await this.transitionTo(CircuitState.CLOSED);
  }
  
  onStateChanged(listener: (event: CircuitStateChangedEvent) => void): void {
    this.eventEmitter.on('circuitStateChanged', listener);
  }
}
```

#### 2. RedisCircuitBreakerStore

Persistent state storage for circuit breaker states using Redis.

```typescript
export class RedisCircuitBreakerStore implements CircuitBreakerStore {
  constructor(private redis: Redis) {}
  
  async getState(key: string): Promise<CircuitState> {
    const state = await this.redis.get(`cb:state:${key}`);
    return (state as CircuitState) || CircuitState.CLOSED;
  }
  
  async setState(key: string, state: CircuitState): Promise<void> {
    await this.redis.set(`cb:state:${key}`, state);
  }
  
  async incrementFailures(key: string): Promise<number> {
    return await this.redis.incr(`cb:failures:${key}`);
  }
  
  async incrementSuccesses(key: string): Promise<number> {
    return await this.redis.incr(`cb:successes:${key}`);
  }
  
  async resetCounters(key: string): Promise<void> {
    await this.redis.del(`cb:failures:${key}`, `cb:successes:${key}`);
  }
  
  async getLastStateChange(key: string): Promise<Date | null> {
    const timestamp = await this.redis.get(`cb:last-change:${key}`);
    return timestamp ? new Date(parseInt(timestamp)) : null;
  }
  
  async setLastStateChange(key: string, date: Date): Promise<void> {
    await this.redis.set(`cb:last-change:${key}`, date.getTime().toString());
  }
}
```

### Usage

```typescript
// Create a circuit breaker for a specific tenant and service
const breaker = new TenantAwareCircuitBreaker(
  new RedisCircuitBreakerStore(redisClient),
  'tenant-123',
  'content-filtering-service',
  new MetricsCollector(redisMetricsClient),
  {
    failureThreshold: 3,
    successThreshold: 2,
    resetTimeoutMs: 30000
  }
);

// Register a state change listener
breaker.onStateChanged((event) => {
  console.log(`Circuit ${event.serviceName} changed to ${event.state} for tenant ${event.tenantId}`);
});

// Execute a function with circuit breaker protection
try {
  const result = await breaker.execute(() => {
    return contentFilterService.filter('content to check');
  });
  
  // Process result if the call succeeded
  processFilteredContent(result);
} catch (error) {
  if (error.message.includes('Circuit breaker is open')) {
    // Handle circuit open case
    useBackupFilteringMethod();
  } else {
    // Handle other errors
    handleServiceError(error);
  }
}
```

## Configuration

### Circuit Breaker Options

The circuit breaker can be configured using the following options:

```typescript
interface CircuitBreakerOptions {
  failureThreshold: number;   // Number of failures before opening circuit
  successThreshold: number;   // Number of successes needed to close circuit
  resetTimeoutMs: number;     // Time in ms before half-opening circuit
  monitorIntervalMs?: number; // How often to check for expired timeouts
}
```

### Environment Variables

```
# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

## Integration with Metrics

The circuit breaker integrates with the metrics collection system to track:

1. Circuit breaker state changes
2. Request rejections when circuit is open
3. Failures that contribute to circuit opening
4. Latency of successful requests

This data is aggregated in Redis time buckets and can be visualized in the operational dashboard.

## Benefits

### 1. Tenant Isolation

By using tenant-specific circuit breakers, issues affecting one tenant don't impact others. For example, if one tenant is making problematic API requests that cause failures, only their circuit will open.

### 2. Graceful Degradation

When a service fails, the circuit breaker provides immediate rejections instead of continuing to make failing calls, which can cascade into broader system failures.

### 3. Self-Healing

The half-open state allows the system to automatically recover when services become available again, without manual intervention.

### 4. Visibility

Circuit breaker events are logged for compliance and metrics, providing visibility into system health and tenant-specific issues.

## Best Practices

1. **Proper Timeouts**: Set appropriate timeouts for underlying services to ensure they fail fast rather than hanging.

2. **Fallback Mechanisms**: Implement fallback mechanisms for when circuits are open.

3. **Circuit Granularity**: Use appropriately granular circuits. Too broad, and you lose isolation. Too narrow, and you lose the protection benefits.

4. **Monitoring**: Monitor circuit state changes to identify recurring issues.

5. **Tuning**: Regularly review and tune thresholds based on service reliability patterns.

## Next Steps

1. **Circuit Dashboard**: Create a dedicated dashboard for circuit breaker states.

2. **Adaptive Thresholds**: Implement machine learning to adapt thresholds based on service patterns.

3. **// filepath: d:\ai-dev-projects\ai-create-assistant\docs\CIRCUIT-BREAKER.md
# Tenant-Aware Circuit Breaker Pattern

This document provides detailed information about the implementation of the tenant-aware circuit breaker pattern in the AI Content Creation Platform.

## Overview

Circuit breakers prevent cascading failures by temporarily disabling components that are experiencing issues. Our implementation adds tenant awareness to ensure that problems affecting one tenant don't impact others.

## Architecture

### Circuit States

The circuit breaker operates in three states:

1. **CLOSED**: Normal operation, requests are passed through to the protected service.
2. **OPEN**: Service is unavailable or failing, requests are immediately rejected.
3. **HALF_OPEN**: Testing if the service has recovered by allowing limited requests through.

![Circuit Breaker States](https://via.placeholder.com/800x300?text=Circuit+Breaker+States+Diagram)

### Components

#### 1. TenantAwareCircuitBreaker

The main circuit breaker implementation with tenant isolation.

```typescript
export class TenantAwareCircuitBreaker {
  constructor(
    private store: CircuitBreakerStore,
    private tenantId: string,
    private serviceName: string,
    private metrics: MetricsCollector,
    private options: CircuitBreakerOptions = {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 30000,
      monitorIntervalMs: 5000
    }
  ) {
    this.eventEmitter = new EventEmitter();
  }
  
  private get circuitKey(): string {
    return `${this.tenantId}:${this.serviceName}`;
  }
  
  async execute<T>(command: () => Promise<T>): Promise<T> {
    const state = await this.store.getState(this.circuitKey);
    
    if (state === CircuitState.OPEN) {
      // Check if it's time to retry
      const lastStateChange = await this.store.getLastStateChange(this.circuitKey);
      const now = new Date();
      
      if (lastStateChange && (now.getTime() - lastStateChange.getTime() > this.options.resetTimeoutMs)) {
        // Try again, move to half-open
        await this.transitionTo(CircuitState.HALF_OPEN);
      } else {
        // Circuit is still open
        await this.metrics.incrementCircuitBreakerRejections(this.tenantId, this.serviceName);
        throw new Error(`Circuit breaker is open for service: ${this.serviceName}`);
      }
    }
    
    try {
      // Execute the command
      const startTime = performance.now();
      const result = await command();
      const latency = performance.now() - startTime;
      
      // Record successful latency
      await this.metrics.recordLatency(`circuit.latency.${this.serviceName}`, latency, this.tenantId);
      
      // Handle success in half-open state
      if (state === CircuitState.HALF_OPEN) {
        const successes = await this.store.incrementSuccesses(this.circuitKey);
        
        if (successes >= this.options.successThreshold) {
          // Enough successes, close the circuit
          await this.transitionTo(CircuitState.CLOSED);
          await this.store.resetCounters(this.circuitKey);
        }
      }
      
      return result;
    } catch (err) {
      // Handle failure
      const error = err as Error;
      
      if (state === CircuitState.HALF_OPEN) {
        // Failed in half-open state, open the circuit again
        await this.transitionTo(CircuitState.OPEN);
      } else {
        // In closed state, increment failure counter
        const failures = await this.store.incrementFailures(this.circuitKey);
        
        // Record the failure in metrics
        await this.metrics.incrementCircuitBreakerFailures(this.tenantId, this.serviceName);
        
        if (failures >= this.options.failureThreshold) {
          // Too many failures, open the circuit
          await this.transitionTo(CircuitState.OPEN);
        }
      }
      
      throw err;
    }
  }
  
  private async transitionTo(state: CircuitState): Promise<void> {
    await this.store.setState(this.circuitKey, state);
    await this.store.setLastStateChange(this.circuitKey, new Date());
    
    this.eventEmitter.emit('circuitStateChanged', {
      tenantId: this.tenantId,
      serviceName: this.serviceName,
      state,
      timestamp: new Date()
    });
    
    // Log the state change for compliance
    await ComplianceLogger.log({
      eventType: `circuit.${state.toLowerCase()}`,
      resourceId: this.serviceName,
      description: `Circuit breaker ${state.toLowerCase()} for service: ${this.serviceName}`,
      metadata: { tenantId: this.tenantId }
    });
    
    // Update metrics
    await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, state);
  }
  
  async reset(): Promise<void> {
    await this.store.resetCounters(this.circuitKey);
    await this.transitionTo(CircuitState.CLOSED);
  }
  
  onStateChanged(listener: (event: CircuitStateChangedEvent) => void): void {
    this.eventEmitter.on('circuitStateChanged', listener);
  }
}
```

#### 2. RedisCircuitBreakerStore

Persistent state storage for circuit breaker states using Redis.

```typescript
export class RedisCircuitBreakerStore implements CircuitBreakerStore {
  constructor(private redis: Redis) {}
  
  async getState(key: string): Promise<CircuitState> {
    const state = await this.redis.get(`cb:state:${key}`);
    return (state as CircuitState) || CircuitState.CLOSED;
  }
  
  async setState(key: string, state: CircuitState): Promise<void> {
    await this.redis.set(`cb:state:${key}`, state);
  }
  
  async incrementFailures(key: string): Promise<number> {
    return await this.redis.incr(`cb:failures:${key}`);
  }
  
  async incrementSuccesses(key: string): Promise<number> {
    return await this.redis.incr(`cb:successes:${key}`);
  }
  
  async resetCounters(key: string): Promise<void> {
    await this.redis.del(`cb:failures:${key}`, `cb:successes:${key}`);
  }
  
  async getLastStateChange(key: string): Promise<Date | null> {
    const timestamp = await this.redis.get(`cb:last-change:${key}`);
    return timestamp ? new Date(parseInt(timestamp)) : null;
  }
  
  async setLastStateChange(key: string, date: Date): Promise<void> {
    await this.redis.set(`cb:last-change:${key}`, date.getTime().toString());
  }
}
```

### Usage

```typescript
// Create a circuit breaker for a specific tenant and service
const breaker = new TenantAwareCircuitBreaker(
  new RedisCircuitBreakerStore(redisClient),
  'tenant-123',
  'content-filtering-service',
  new MetricsCollector(redisMetricsClient),
  {
    failureThreshold: 3,
    successThreshold: 2,
    resetTimeoutMs: 30000
  }
);

// Register a state change listener
breaker.onStateChanged((event) => {
  console.log(`Circuit ${event.serviceName} changed to ${event.state} for tenant ${event.tenantId}`);
});

// Execute a function with circuit breaker protection
try {
  const result = await breaker.execute(() => {
    return contentFilterService.filter('content to check');
  });
  
  // Process result if the call succeeded
  processFilteredContent(result);
} catch (error) {
  if (error.message.includes('Circuit breaker is open')) {
    // Handle circuit open case
    useBackupFilteringMethod();
  } else {
    // Handle other errors
    handleServiceError(error);
  }
}
```

## Configuration

### Circuit Breaker Options

The circuit breaker can be configured using the following options:

```typescript
interface CircuitBreakerOptions {
  failureThreshold: number;   // Number of failures before opening circuit
  successThreshold: number;   // Number of successes needed to close circuit
  resetTimeoutMs: number;     // Time in ms before half-opening circuit
  monitorIntervalMs?: number; // How often to check for expired timeouts
}
```

### Environment Variables

```
# Circuit Breaker Configuration
CIRCUIT_BREAKER_FAILURE_THRESHOLD=5
CIRCUIT_BREAKER_SUCCESS_THRESHOLD=3
CIRCUIT_BREAKER_RESET_TIMEOUT_MS=30000
```

## Integration with Metrics

The circuit breaker integrates with the metrics collection system to track:

1. Circuit breaker state changes
2. Request rejections when circuit is open
3. Failures that contribute to circuit opening
4. Latency of successful requests

This data is aggregated in Redis time buckets and can be visualized in the operational dashboard.

## Benefits

### 1. Tenant Isolation

By using tenant-specific circuit breakers, issues affecting one tenant don't impact others. For example, if one tenant is making problematic API requests that cause failures, only their circuit will open.

### 2. Graceful Degradation

When a service fails, the circuit breaker provides immediate rejections instead of continuing to make failing calls, which can cascade into broader system failures.

### 3. Self-Healing

The half-open state allows the system to automatically recover when services become available again, without manual intervention.

### 4. Visibility

Circuit breaker events are logged for compliance and metrics, providing visibility into system health and tenant-specific issues.

## Best Practices

1. **Proper Timeouts**: Set appropriate timeouts for underlying services to ensure they fail fast rather than hanging.

2. **Fallback Mechanisms**: Implement fallback mechanisms for when circuits are open.

3. **Circuit Granularity**: Use appropriately granular circuits. Too broad, and you lose isolation. Too narrow, and you lose the protection benefits.

4. **Monitoring**: Monitor circuit state changes to identify recurring issues.

5. **Tuning**: Regularly review and tune thresholds based on service reliability patterns.

## Next Steps

1. **Circuit Dashboard**: Create a dedicated dashboard for circuit breaker states.

2. **Adaptive Thresholds**: Implement machine learning to adapt thresholds based on service patterns.

3. **