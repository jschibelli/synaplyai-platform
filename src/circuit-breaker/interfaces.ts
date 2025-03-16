// src/circuit-breaker/interfaces.ts
export enum CircuitState {
  CLOSED = 'CLOSED',     // Circuit is closed, requests flow through
  OPEN = 'OPEN',         // Circuit is open, requests fail fast
  HALF_OPEN = 'HALF_OPEN' // Circuit is testing if service has recovered
}

export interface CircuitBreakerOptions {
  failureThreshold: number;   // Number of failures before opening circuit
  successThreshold: number;   // Number of successes needed to close circuit
  resetTimeoutMs: number;     // Time in ms before half-opening circuit
  monitorIntervalMs?: number; // How often to check for expired timeouts
}

export interface CircuitBreakerStore {
  getState(key: string): Promise<CircuitState>;
  setState(key: string, state: CircuitState): Promise<void>;
  incrementFailures(key: string): Promise<number>;
  incrementSuccesses(key: string): Promise<number>;
  resetCounters(key: string): Promise<void>;
  getLastStateChange(key: string): Promise<Date | null>;
  setLastStateChange(key: string, timestamp: Date): Promise<void>;
  
  // New methods for bulkhead pattern
  incrementCounter(key: string): Promise<number>;
  decrementCounter(key: string): Promise<number>;
}

export interface CircuitBreaker {
  execute<T>(command: () => Promise<T>): Promise<T>;
  getState(): Promise<CircuitState>;
  reset(): Promise<void>;
  on(event: string, listener: (...args: any[]) => void): this;
}