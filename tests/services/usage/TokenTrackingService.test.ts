import { TokenTrackingService } from '../../../src/services/usage/TokenTrackingService';
import { RedisClient } from '../../../src/services/redis/RedisClient';
import { TenantContext } from '../../../src/services/tenant/TenantContext';
import { MetricsCollector } from '../../../src/services/metrics/MetricsCollector';

describe('TokenTrackingService', () => {
  let tokenTrackingService: TokenTrackingService;
  let mockRedisClient: jest.Mocked<RedisClient>;
  let mockTenantContext: jest.Mocked<TenantContext>;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;

  beforeEach(() => {
    mockRedisClient = {
      pipeline: jest.fn().mockReturnThis(),
      hincrby: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
      hget: jest.fn()
    } as any;

    mockTenantContext = {
      getCurrentTenant: jest.fn().mockReturnValue('test-tenant-1')
    } as any;

    mockMetricsCollector = {
      trackMetric: jest.fn().mockResolvedValue(true)
    } as any;

    tokenTrackingService = new TokenTrackingService(
      mockRedisClient,
      mockTenantContext,
      mockMetricsCollector
    );
  });

  test('should track token usage with proper tenant isolation', async () => {
    const usage = {
      tenantId: 'test-tenant-1',
      modelId: 'gpt-4',
      requestTokens: 100,
      responseTokens: 50
    };

    await tokenTrackingService.trackTokenUsage(usage);

    expect(mockRedisClient.pipeline).toHaveBeenCalled();
    expect(mockRedisClient.hincrby).toHaveBeenCalledWith(
      expect.stringContaining('usage:test-tenant-1'),
      'gpt-4:request',
      100
    );
    expect(mockRedisClient.hincrby).toHaveBeenCalledWith(
      expect.stringContaining('usage:test-tenant-1'),
      'gpt-4:response',
      50
    );
  });

  test('should record usage metrics', async () => {
    const usage = {
      tenantId: 'test-tenant-1',
      modelId: 'gpt-4',
      requestTokens: 100,
      responseTokens: 50
    };

    await tokenTrackingService.trackTokenUsage(usage);

    expect(mockMetricsCollector.trackMetric).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'token.usage.request',
        value: 100,
        tags: expect.objectContaining({
          tenantId: 'test-tenant-1',
          modelId: 'gpt-4'
        })
      })
    );
  });

  test('should handle errors gracefully', async () => {
    mockRedisClient.exec.mockRejectedValueOnce(new Error('Redis error'));

    const result = await tokenTrackingService.trackTokenUsage({
      tenantId: 'test-tenant-1',
      modelId: 'gpt-4',
      requestTokens: 100,
      responseTokens: 50
    });

    expect(result).toBe(false);
  });
});