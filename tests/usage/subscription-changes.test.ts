import { SubscriptionManager } from '../../src/services/SubscriptionManager';
import { UsageTracker } from '../../src/services/usage/UsageTracker';
import { redisMock, createRedisMock } from '../../src/__mocks__/redis.mock';

describe('Subscription Changes', () => {
  let subscriptionManager: SubscriptionManager;
  let usageTracker: UsageTracker;

  beforeAll(() => {
    // Set up test environment
    process.env = { ...process.env, NODE_ENV: 'test' };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset Redis mock for each test
    Object.assign(redisMock, createRedisMock());
    
    subscriptionManager = new SubscriptionManager();
    usageTracker = new UsageTracker(subscriptionManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should handle mid-cycle subscription changes', async () => {
    const tenantId = 'test-tenant';
    
    // Mock initial subscription
    jest.spyOn(subscriptionManager, 'getActiveSubscription')
      .mockResolvedValueOnce({
        tier: 'pro',
        maxDailyTokens: 50000,
        maxMonthlyTokens: 500000,
        effectiveFrom: new Date(),
        effectiveTo: null
      });

    // Track usage with new limits
    const result = await usageTracker.trackTokenUsage(tenantId, 'gpt-4', 20000);
    expect(result).toBe(true);
  });
});