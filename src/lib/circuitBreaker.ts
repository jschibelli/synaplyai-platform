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