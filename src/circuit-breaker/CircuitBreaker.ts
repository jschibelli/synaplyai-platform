import { CircuitState } from './interfaces';
import { MetricsCollector } from '../metrics/metrics-collector';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  successThreshold?: number;
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastStateChange: Date = new Date();
  private options: Required<CircuitBreakerOptions>;

  constructor(
    options: CircuitBreakerOptions,
    private metricsCollector?: MetricsCollector
  ) {
    this.options = {
      successThreshold: 2,
      ...options
    };
  }

  async execute<T>(command: () => Promise<T>): Promise<T> {
    const currentState = this.state;

    if (currentState === CircuitState.OPEN) {
      // Check if reset timeout has elapsed
      const now = new Date();
      const elapsedMs = now.getTime() - this.lastStateChange.getTime();
      
      if (elapsedMs >= this.options.resetTimeout) {
        this.transitionToState(CircuitState.HALF_OPEN);
      } else {
        this.metricsCollector?.incrementCircuitBreakerRejections('default', 'default');
        throw new Error(`Circuit breaker is open - requests are not being accepted`);
      }
    }

    try {
      const result = await command();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordSuccess(): void {
    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;
      
      if (this.successCount >= this.options.successThreshold) {
        this.transitionToState(CircuitState.CLOSED);
      }
    }
    
    // Reset failure count in CLOSED state
    if (this.state === CircuitState.CLOSED) {
      this.failureCount = 0;
    }
  }

  private recordFailure(): void {
    this.failureCount++;
    
    if (this.state === CircuitState.CLOSED && 
        this.failureCount >= this.options.failureThreshold) {
      this.transitionToState(CircuitState.OPEN);
    } else if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN state should reopen the circuit
      this.transitionToState(CircuitState.OPEN);
    }
  }

  private transitionToState(newState: CircuitState): void {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = new Date();
    
    // Reset counters
    if (newState === CircuitState.CLOSED) {
      this.failureCount = 0;
    } else if (newState === CircuitState.HALF_OPEN) {
      this.successCount = 0;
    }
    
    this.metricsCollector?.setCircuitBreakerState('default', 'default', newState);
    
    console.log(`Circuit breaker transitioned from ${oldState} to ${newState}`);
  }

  async getState(): Promise<CircuitState> {
    return this.state;
  }
}