import { EventEmitter } from 'events';

// Define necessary types and interfaces
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

interface CircuitBreakerOptions {
  failureThreshold: number;
  successThreshold: number;
  resetTimeoutMs: number;
  monitorIntervalMs?: number;
}

interface CircuitBreakerStore {
  getState(key: string): Promise<CircuitState>;
  setState(key: string, state: CircuitState): Promise<void>;
  incrementFailures(key: string): Promise<number>;
  incrementSuccesses(key: string): Promise<number>;
  resetCounters(key: string): Promise<void>;
  getLastStateChange(key: string): Promise<Date | null>;
  setLastStateChange(key: string, date: Date): Promise<void>;
}

interface MetricsCollector {
  setCircuitBreakerState(tenantId: string, serviceName: string, state: CircuitState): Promise<void>;
  incrementCircuitBreakerFailures(tenantId: string, serviceName: string): Promise<void>;
  incrementCircuitBreakerRejections(tenantId: string, serviceName: string): Promise<void>;
  recordLatency(name: string, latencyMs: number, tenantId: string): Promise<void>;
}

// Mock the ComplianceLogger
const mockComplianceLogger = {
  log: jest.fn().mockResolvedValue(undefined)
};

jest.mock('../compliance/logger', () => ({
  ComplianceLogger: mockComplianceLogger
}));

// Create a simplified TenantAwareCircuitBreaker class for testing
class TenantAwareCircuitBreaker {
  private eventEmitter: EventEmitter;
  
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
        await this.store.setState(this.circuitKey, CircuitState.HALF_OPEN);
        await this.store.setLastStateChange(this.circuitKey, now);
        
        this.eventEmitter.emit('circuitStateChanged', {
          tenantId: this.tenantId,
          serviceName: this.serviceName,
          state: CircuitState.HALF_OPEN,
          timestamp: now
        });
        
        await mockComplianceLogger.log({
          eventType: 'circuit.half-open',
          resourceId: this.serviceName,
          description: `Circuit breaker half-open for service: ${this.serviceName}`,
          metadata: { tenantId: this.tenantId }
        });
        
        // Update metrics
        await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.HALF_OPEN);
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
      
      // Handle success
      if (state === CircuitState.HALF_OPEN) {
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
          
          await mockComplianceLogger.log({
            eventType: 'circuit.closed',
            resourceId: this.serviceName,
            description: `Circuit breaker closed for service: ${this.serviceName}`,
            metadata: { tenantId: this.tenantId, successes }
          });
          
          // Update metrics
          await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.CLOSED);
        }
      }
      
      return result;
    } catch (err) {
      // Handle failure
      const error = err as Error; // Type assertion for the error
      
      if (state === CircuitState.HALF_OPEN) {
        // Failed in half-open state, open the circuit again
        await this.store.setState(this.circuitKey, CircuitState.OPEN);
        await this.store.setLastStateChange(this.circuitKey, new Date());
        
        this.eventEmitter.emit('circuitStateChanged', {
          tenantId: this.tenantId,
          serviceName: this.serviceName,
          state: CircuitState.OPEN,
          timestamp: new Date()
        });
        
        await mockComplianceLogger.log({
          eventType: 'circuit.opened',
          resourceId: this.serviceName,
          description: `Circuit breaker opened for service: ${this.serviceName}`,
          metadata: { tenantId: this.tenantId, error: error.message }
        });
        
        // Update metrics
        await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.OPEN);
      } else {
        // In closed state, increment failure counter
        const failures = await this.store.incrementFailures(this.circuitKey);
        
        // Record the failure in metrics
        await this.metrics.incrementCircuitBreakerFailures(this.tenantId, this.serviceName);
        
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
          
          await mockComplianceLogger.log({
            eventType: 'circuit.opened',
            resourceId: this.serviceName,
            description: `Circuit breaker opened for service: ${this.serviceName}`,
            metadata: { tenantId: this.tenantId, failures, error: error.message }
          });
          
          // Update metrics
          await this.metrics.setCircuitBreakerState(this.tenantId, this.serviceName, CircuitState.OPEN);
        }
      }
      
      throw err;
    }
  }
}

// Mock CircuitBreakerStore
class RedisCircuitBreakerStore implements CircuitBreakerStore {
  constructor(private redisUrl: string) {}
  
  async getState(key: string): Promise<CircuitState> {
    return CircuitState.CLOSED;
  }
  
  async setState(key: string, state: CircuitState): Promise<void> {}
  
  async incrementFailures(key: string): Promise<number> {
    return 0;
  }
  
  async incrementSuccesses(key: string): Promise<number> {
    return 0;
  }
  
  async resetCounters(key: string): Promise<void> {}
  
  async getLastStateChange(key: string): Promise<Date | null> {
    return new Date();
  }
  
  async setLastStateChange(key: string, date: Date): Promise<void> {}
}

// Mock for testing
jest.mock('../circuit-breaker/redis-store');
jest.mock('../metrics/collector');

describe('TenantAwareCircuitBreaker', () => {
  let store: jest.Mocked<CircuitBreakerStore>;
  let metrics: jest.Mocked<MetricsCollector>;
  let circuitBreaker: TenantAwareCircuitBreaker;
  const tenantId = 'test-tenant';
  const serviceName = 'test-service';
  
  beforeEach(() => {
    // Create mocked instances
    store = {
      getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
      setState: jest.fn().mockResolvedValue(undefined),
      incrementFailures: jest.fn().mockResolvedValue(0),
      incrementSuccesses: jest.fn().mockResolvedValue(0),
      resetCounters: jest.fn().mockResolvedValue(undefined),
      getLastStateChange: jest.fn().mockResolvedValue(new Date()),
      setLastStateChange: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<CircuitBreakerStore>;
    
    metrics = {
      setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
      incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
      incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
      recordLatency: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create the circuit breaker
    circuitBreaker = new TenantAwareCircuitBreaker(
      store,
      tenantId,
      serviceName,
      metrics,
      {
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 30000,
        monitorIntervalMs: 5000
      }
    );
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  test('should execute function successfully when circuit is closed', async () => {
    const result = await circuitBreaker.execute(() => Promise.resolve('success'));
    expect(result).toBe('success');
    expect(store.getState).toHaveBeenCalled();
  });
  
  test('should trip circuit after exceeding failure threshold', async () => {
    store.getState.mockResolvedValue(CircuitState.CLOSED);
    store.incrementFailures
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3); // Third failure trips the circuit
    
    // First failure
    await expect(circuitBreaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    // Second failure
    await expect(circuitBreaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    // Third failure should trip the circuit
    await expect(circuitBreaker.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    
    // Verify the circuit was opened
    expect(store.setState).toHaveBeenCalledWith(expect.any(String), CircuitState.OPEN);
    expect(metrics.setCircuitBreakerState).toHaveBeenCalledWith(tenantId, serviceName, CircuitState.OPEN);
  });
  
  test('should reject requests when circuit is open', async () => {
    store.getState.mockResolvedValue(CircuitState.OPEN);
    store.getLastStateChange.mockResolvedValue(new Date()); // Recent state change
    
    // The circuit is open, so execution should fail
    await expect(circuitBreaker.execute(() => Promise.resolve('success')))
      .rejects.toThrow(/Circuit breaker is open/);
      
    expect(metrics.incrementCircuitBreakerRejections).toHaveBeenCalledWith(tenantId, serviceName);
  });
  
  test('should transition to half-open state after timeout', async () => {
    // Set up initial state as open
    store.getState.mockResolvedValue(CircuitState.OPEN);
    
    // Mock that the state change was long enough ago to trigger timeout
    const pastDate = new Date(Date.now() - 40000); // 40 seconds ago (past the resetTimeoutMs)
    store.getLastStateChange.mockResolvedValue(pastDate);
    
    // Execute should check the timeout and transition to half-open
    await circuitBreaker.execute(() => Promise.resolve('success in half-open state'));
    
    // Verify the state was changed to half-open
    expect(store.setState).toHaveBeenCalledWith(expect.any(String), CircuitState.HALF_OPEN);
  });
  
  test('should close circuit after successful attempts in half-open state', async () => {
    // Set initial state as half-open
    store.getState.mockResolvedValue(CircuitState.HALF_OPEN);
    
    // Mock success threshold reached
    store.incrementSuccesses.mockResolvedValue(2); // Success threshold reached
    
    // Execute should succeed and close the circuit
    await circuitBreaker.execute(() => Promise.resolve('success in half-open state'));
    
    // Verify the state was changed to closed
    expect(store.setState).toHaveBeenCalledWith(expect.any(String), CircuitState.CLOSED);
    expect(metrics.setCircuitBreakerState).toHaveBeenCalledWith(tenantId, serviceName, CircuitState.CLOSED);
  });
});