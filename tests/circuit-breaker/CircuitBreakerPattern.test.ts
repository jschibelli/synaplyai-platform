import { TenantAwareCircuitBreaker } from '../../src/circuit-breaker/tenant-breaker';
import { RedisCircuitBreakerStore } from '../../src/circuit-breaker/redis-store';
import { CircuitState } from '../../src/circuit-breaker/interfaces';
import { MetricsCollector } from '../../src/services/metrics/MetricsCollector';

describe('Circuit Breaker Pattern', () => {
  let circuitBreaker: TenantAwareCircuitBreaker;
  let mockStore: jest.Mocked<RedisCircuitBreakerStore>;
  let mockMetrics: jest.Mocked<MetricsCollector>;
  
  const TEST_TENANT = 'test-tenant-1';
  const TEST_SERVICE = 'ai-completion-service';

  beforeEach(() => {
    mockStore = {
      getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
      setState: jest.fn().mockResolvedValue(undefined),
      incrementFailures: jest.fn().mockResolvedValue(0),
      incrementSuccesses: jest.fn().mockResolvedValue(0),
      resetCounters: jest.fn().mockResolvedValue(undefined),
      getLastStateChange: jest.fn().mockResolvedValue(new Date()),
      setLastStateChange: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockMetrics = {
      setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
      incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
      incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
      trackMetric: jest.fn().mockResolvedValue(true)
    } as any;

    circuitBreaker = new TenantAwareCircuitBreaker(
      mockStore,
      TEST_TENANT,
      TEST_SERVICE,
      mockMetrics,
      {
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeoutMs: 30000
      }
    );
  });

  test('should start in closed state', async () => {
    const state = await circuitBreaker.getState();
    expect(state).toBe(CircuitState.CLOSED);
  });

  test('should track failures and open circuit after threshold', async () => {
    mockStore.incrementFailures
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3);

    // First failure
    await expect(
      circuitBreaker.execute(() => Promise.reject(new Error('test error')))
    ).rejects.toThrow('test error');

    // Second failure
    await expect(
      circuitBreaker.execute(() => Promise.reject(new Error('test error')))
    ).rejects.toThrow('test error');

    // Third failure should open circuit
    await expect(
      circuitBreaker.execute(() => Promise.reject(new Error('test error')))
    ).rejects.toThrow('test error');

    expect(mockStore.setState).toHaveBeenCalledWith(
      expect.any(String),
      CircuitState.OPEN
    );
    expect(mockMetrics.setCircuitBreakerState).toHaveBeenCalledWith(
      TEST_TENANT,
      TEST_SERVICE,
      CircuitState.OPEN
    );
  });

  test('should reject requests when circuit is open', async () => {
    mockStore.getState.mockResolvedValue(CircuitState.OPEN);
    mockStore.getLastStateChange.mockResolvedValue(new Date());

    await expect(
      circuitBreaker.execute(() => Promise.resolve('success'))
    ).rejects.toThrow(/Circuit breaker is open/);

    expect(mockMetrics.incrementCircuitBreakerRejections).toHaveBeenCalledWith(
      TEST_TENANT,
      TEST_SERVICE
    );
  });

  test('should transition to half-open state after timeout', async () => {
    mockStore.getState.mockResolvedValue(CircuitState.OPEN);
    const pastDate = new Date(Date.now() - 40000); // Past the resetTimeoutMs
    mockStore.getLastStateChange.mockResolvedValue(pastDate);

    await circuitBreaker.execute(() => Promise.resolve('success'));

    expect(mockStore.setState).toHaveBeenCalledWith(
      expect.any(String),
      CircuitState.HALF_OPEN
    );
  });

  test('should close circuit after successful attempts in half-open state', async () => {
    mockStore.getState.mockResolvedValue(CircuitState.HALF_OPEN);
    mockStore.incrementSuccesses.mockResolvedValue(2); // Success threshold reached

    await circuitBreaker.execute(() => Promise.resolve('success'));

    expect(mockStore.setState).toHaveBeenCalledWith(
      expect.any(String),
      CircuitState.CLOSED
    );
    expect(mockMetrics.setCircuitBreakerState).toHaveBeenCalledWith(
      TEST_TENANT,
      TEST_SERVICE,
      CircuitState.CLOSED
    );
  });

  test('should maintain tenant isolation', async () => {
    const tenant2CircuitBreaker = new TenantAwareCircuitBreaker(
      mockStore,
      'tenant-2',
      TEST_SERVICE,
      mockMetrics
    );

    // Open circuit for tenant 1
    mockStore.incrementFailures.mockResolvedValue(3);
    await expect(
      circuitBreaker.execute(() => Promise.reject(new Error('error')))
    ).rejects.toThrow();

    // Tenant 2 should still work
    await tenant2CircuitBreaker.execute(() => Promise.resolve('success'));

    expect(mockStore.getState).toHaveBeenCalledWith(expect.stringContaining('tenant-2'));
  });
});