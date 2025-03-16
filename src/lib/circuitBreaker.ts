/**
 * Circuit Breaker implementation for handling API outages
 * 
 * This pattern prevents cascading failures by failing fast when
 * a service is known to be down, rather than letting requests pile up.
 */

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  failureThreshold: number;   // Number of failures before opening circuit
  resetTimeout: number;       // Time in ms before attempting reset (half-open)
  timeout?: number;           // Request timeout in ms
}

interface TenantBreaker extends CircuitBreakerOptions {
  tenantId: string;
  serviceType: 'ai' | 'filter' | 'metrics';
}

export interface CircuitMetrics {
  failureCount: number;
  lastFailureTime: number;
  consecutiveSuccesses: number;
  totalRequests: number;
  errorPercentage: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private lastFailureTime: number = 0;
  private readonly options: CircuitBreakerOptions;
  
  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: 3,
      resetTimeout: 30000, // 30 seconds
      timeout: 10000,      // 10 seconds
      ...options
    };
  }
  
  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      // Check if it's time to try again
      const timeSinceLastFailure = Date.now() - this.lastFailureTime;
      if (timeSinceLastFailure > this.options.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }

    let timeoutId: NodeJS.Timeout | undefined;
    
    try {
      // Execute with timeout
      const result = await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          if (this.options.timeout) {
            timeoutId = setTimeout(() => {
              reject(new Error('Request timeout'));
            }, this.options.timeout);
            // Ensure the timer doesn't keep the process running
            timeoutId.unref();
          }
        })
      ]);

      // If successful and in HALF_OPEN, reset the circuit
      if (this.state === 'HALF_OPEN') {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
  
  /**
   * Record a failure and potentially open the circuit
   */
  private recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.options.failureThreshold ||
        this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
    }
  }
  
  /**
   * Reset the circuit breaker to closed state
   */
  private reset(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }
}

export class TenantAwareCircuitBreaker extends CircuitBreaker {
  private tenantId: string;
  private serviceType: string;
  
  constructor(options: TenantBreaker) {
    super(options);
    this.tenantId = options.tenantId;
    this.serviceType = options.serviceType;
  }

  protected async recordFailure(): Promise<void> {
    await redisClient.hincrby(
      `circuit:${this.tenantId}:${this.serviceType}`, 
      'failures', 
      1
    );
    super.recordFailure();
  }
}

export class EnhancedCircuitBreaker extends TenantAwareCircuitBreaker {
  private healthCheckInterval: NodeJS.Timer | null = null;
  
  constructor(options: TenantBreaker & { 
    healthCheckInterval?: number;
    errorPercentageThreshold?: number; 
  }) {
    super(options);
    this.startHealthCheck(options.healthCheckInterval || 60000);
  }

  private startHealthCheck(interval: number): void {
    this.healthCheckInterval = setInterval(async () => {
      const metrics = await this.getMetrics();
      await this.evaluateHealth(metrics);
    }, interval);
  }

  private async evaluateHealth(metrics: CircuitMetrics): Promise<void> {
    // Add complex health evaluation logic
    if (metrics.errorPercentage > this.errorPercentageThreshold) {
      await this.forceOpen(`Error percentage ${metrics.errorPercentage}% exceeded threshold`);
    }
  }
}

// Add to src/lib/circuitBreaker.ts
export class HybridCircuitBreaker extends CircuitBreaker {
  private static readonly SUCCESS_THRESHOLD = 5;
  private successCount: number = 0;
  private lastStateChange: number = Date.now();

  protected async checkState(): Promise<void> {
    const now = Date.now();
    const metrics = await this.getMetrics();
    
    switch (this.state) {
      case 'OPEN':
        if (now - this.lastStateChange > this.options.resetTimeout) {
          await this.transitionToHalfOpen();
        }
        break;
      
      case 'HALF_OPEN':
        if (this.successCount >= HybridCircuitBreaker.SUCCESS_THRESHOLD) {
          await this.transitionToClosed();
        } else if (metrics.errorPercentage > this.options.errorThreshold) {
          await this.transitionToOpen();
        }
        break;
      
      case 'CLOSED':
        if (metrics.errorPercentage > this.options.errorThreshold) {
          await this.transitionToOpen();
        }
        break;
    }
  }

  private async transitionToState(newState: CircuitState): Promise<void> {
    this.state = newState;
    this.lastStateChange = Date.now();
    this.successCount = 0;
    
    await this.notifyStateChange(newState);
  }
}