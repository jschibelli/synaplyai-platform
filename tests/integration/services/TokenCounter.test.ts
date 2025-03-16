Sure, here's the contents for the file: /usage-tracking-system/usage-tracking-system/tests/integration/services/TokenCounter.test.ts

import { TokenCounter } from '../../../../src/services/TokenCounter';
import { createClient } from 'redis-mock'; // Mock Redis client for testing
import { promisify } from 'util';

const redisClient = createClient();
const hgetAsync = promisify(redisClient.hget).bind(redisClient);
const hsetAsync = promisify(redisClient.hset).bind(redisClient);
const xaddAsync = promisify(redisClient.xadd).bind(redisClient);

describe('TokenCounter', () => {
  let tokenCounter: TokenCounter;

  beforeAll(() => {
    tokenCounter = new TokenCounter();
  });

  beforeEach(async () => {
    // Clear Redis before each test
    await redisClient.flushdb();
  });

  it('should record usage correctly in Redis', async () => {
    const tenantId = 'tenant1';
    const modelId = 'model1';
    const requestTokens = 10;
    const responseTokens = 5;

    await tokenCounter.recordUsage(tenantId, modelId, requestTokens, responseTokens);

    const today = new Date().toISOString().split('T')[0];
    const dailyUsage = await hgetAsync(`usage:daily:${tenantId}:${today}`, `model:${modelId}:request`);
    const dailyResponse = await hgetAsync(`usage:daily:${tenantId}:${today}`, `model:${modelId}:response`);

    expect(dailyUsage).toBe('10');
    expect(dailyResponse).toBe('5');
  });

  it('should publish an event to the event stream', async () => {
    const tenantId = 'tenant1';
    const modelId = 'model1';
    const requestTokens = 10;
    const responseTokens = 5;

    await tokenCounter.recordUsage(tenantId, modelId, requestTokens, responseTokens);

    const events = await redisClient.xread('BLOCK', 0, 'STREAMS', `usage-events:${tenantId}`, '$');
    expect(events).toBeDefined();
    expect(events.length).toBeGreaterThan(0);
  });
});