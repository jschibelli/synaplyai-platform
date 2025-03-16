Sure, here's the contents for the file: /usage-tracking-system/usage-tracking-system/tests/integration/services/AllowanceCheck.test.ts

import { AllowanceCheckService } from '../../../../src/services/AllowanceCheckService';
import { SubscriptionManager } from '../../../../src/services/SubscriptionManager';
import { createClient } from 'redis-mock'; // Mock Redis client for testing
import { Subscription } from '../../../../src/models/Subscription';

describe('AllowanceCheckService', () => {
  let allowanceCheckService: AllowanceCheckService;
  let subscriptionManager: SubscriptionManager;
  let redisClient: any;

  beforeAll(() => {
    redisClient = createClient();
    subscriptionManager = new SubscriptionManager();
    allowanceCheckService = new AllowanceCheckService(redisClient, subscriptionManager);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should allow usage within daily limit', async () => {
    const tenantId = 'tenant1';
    const estimatedTokens = 50;

    const subscription: Subscription = {
      id: 'sub1',
      tenantId: tenantId,
      tier: 'basic',
      maxDailyTokens: 100,
      maxMonthlyTokens: 300,
      effectiveFrom: new Date(),
      effectiveTo: null,
      overspillPolicy: 'HARD_CUTOFF',
    };

    jest.spyOn(subscriptionManager, 'getActiveSubscription').mockResolvedValue(subscription);
    await redisClient.hset(`usage:daily:${tenantId}:${new Date().toISOString().split('T')[0]}`, 'total:request', 30);

    const result = await allowanceCheckService.checkAllowance(tenantId, estimatedTokens);
    expect(result).toBe(true);
  });

  it('should block usage exceeding daily limit', async () => {
    const tenantId = 'tenant1';
    const estimatedTokens = 80;

    const subscription: Subscription = {
      id: 'sub1',
      tenantId: tenantId,
      tier: 'basic',
      maxDailyTokens: 100,
      maxMonthlyTokens: 300,
      effectiveFrom: new Date(),
      effectiveTo: null,
      overspillPolicy: 'HARD_CUTOFF',
    };

    jest.spyOn(subscriptionManager, 'getActiveSubscription').mockResolvedValue(subscription);
    await redisClient.hset(`usage:daily:${tenantId}:${new Date().toISOString().split('T')[0]}`, 'total:request', 30);

    const result = await allowanceCheckService.checkAllowance(tenantId, estimatedTokens);
    expect(result).toBe(true);

    await redisClient.hset(`usage:daily:${tenantId}:${new Date().toISOString().split('T')[0]}`, 'total:request', 30 + estimatedTokens);

    const resultAfterExceeding = await allowanceCheckService.checkAllowance(tenantId, estimatedTokens);
    expect(resultAfterExceeding).toBe(false);
  });

  it('should allow usage within monthly limit', async () => {
    const tenantId = 'tenant1';
    const estimatedTokens = 50;

    const subscription: Subscription = {
      id: 'sub1',
      tenantId: tenantId,
      tier: 'basic',
      maxDailyTokens: 100,
      maxMonthlyTokens: 300,
      effectiveFrom: new Date(),
      effectiveTo: null,
      overspillPolicy: 'HARD_CUTOFF',
    };

    jest.spyOn(subscriptionManager, 'getActiveSubscription').mockResolvedValue(subscription);
    await redisClient.hset(`usage:monthly:${tenantId}:${new Date().toISOString().split('T')[0].slice(0, 7)}`, 'total:request', 200);

    const result = await allowanceCheckService.checkAllowance(tenantId, estimatedTokens);
    expect(result).toBe(true);
  });

  it('should block usage exceeding monthly limit', async () => {
    const tenantId = 'tenant1';
    const estimatedTokens = 150;

    const subscription: Subscription = {
      id: 'sub1',
      tenantId: tenantId,
      tier: 'basic',
      maxDailyTokens: 100,
      maxMonthlyTokens: 300,
      effectiveFrom: new Date(),
      effectiveTo: null,
      overspillPolicy: 'HARD_CUTOFF',
    };

    jest.spyOn(subscriptionManager, 'getActiveSubscription').mockResolvedValue(subscription);
    await redisClient.hset(`usage:monthly:${tenantId}:${new Date().toISOString().split('T')[0].slice(0, 7)}`, 'total:request', 200);

    const result = await allowanceCheckService.checkAllowance(tenantId, estimatedTokens);
    expect(result).toBe(false);
  });
});