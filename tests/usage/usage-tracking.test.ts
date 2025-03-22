import { SubscriptionManager } from '../../src/services/SubscriptionManager';
import { UsageTracker } from '../../src/services/usage/UsageTracker';
import { redisMock, createRedisMock } from '../../src/__mocks__/redis.mock';
import { CircuitBreaker } from '../../../src/circuit-breaker/CircuitBreaker';

describe('Usage Tracking', () => {
  let usageTracker: UsageTracker;
  let subscriptionManager: SubscriptionManager;
  const circuitBreaker = new CircuitBreaker({
    failureThreshold: 3,
    resetTimeout: 30000
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    Object.assign(redisMock, createRedisMock());
    
    subscriptionManager = new SubscriptionManager();
    usageTracker = new UsageTracker(subscriptionManager);

    jest.spyOn(subscriptionManager, 'getActiveSubscription').mockResolvedValue({
      tier: 'pro',
      maxDailyTokens: 50000,
      maxMonthlyTokens: 500000,
      effectiveFrom: new Date(),
      effectiveTo: null
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should track token usage within limits', async () => {
    const result = await usageTracker.trackTokenUsage('test-tenant', 'gpt-4', 1000);
    expect(result).toBe(true);
    expect(redisMock.multi).toHaveBeenCalled();
    expect(redisMock.exec).toHaveBeenCalled();
  });

  it('should reject usage beyond daily limit', async () => {
    redisMock.hget
      .mockResolvedValueOnce('45000')  // daily usage
      .mockResolvedValueOnce('100000'); // monthly usage
    
    const result = await usageTracker.trackTokenUsage('test-tenant', 'gpt-4', 10000);
    expect(result).toBe(false);
  });

  it('should maintain separate counters per tenant', async () => {
    redisMock.hget
      .mockResolvedValueOnce('5000')  // tenant-1 daily
      .mockResolvedValueOnce('5000')  // tenant-1 monthly
      .mockResolvedValueOnce('5000')  // tenant-2 daily
      .mockResolvedValueOnce('5000'); // tenant-2 monthly
    
    const tenant1Result = await usageTracker.trackTokenUsage('tenant-1', 'gpt-4', 4000);
    expect(tenant1Result).toBe(true);

    const tenant2Result = await usageTracker.trackTokenUsage('tenant-2', 'gpt-4', 4000);
    expect(tenant2Result).toBe(true);
  });

  it('should handle Redis failures gracefully', async () => {
    // Spy on console.error to ensure it's not called in test environment
    const consoleErrorSpy = jest.spyOn(console, 'error');
    
    // Mock Redis failure
    redisMock.multi.mockImplementationOnce(() => {
      throw new Error('Redis connection failed');
    });

    // Should fall back to in-memory cache
    const result = await usageTracker.trackTokenUsage('test-tenant', 'gpt-4', 100);
    
    // Verify the result
    expect(result).toBe(true);
    
    // Verify console.error was not called
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    
    // Verify fallback cache works for subsequent requests
    const secondResult = await usageTracker.trackTokenUsage('test-tenant', 'gpt-4', 100);
    expect(secondResult).toBe(true);
    
    // Restore console.error spy
    consoleErrorSpy.mockRestore();
  });
});