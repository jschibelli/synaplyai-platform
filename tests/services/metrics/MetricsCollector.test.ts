import { MetricsCollector } from '../../../src/services/metrics/MetricsCollector';
import { RedisClient } from '../../../src/services/redis/RedisClient';
import { TenantContext } from '../../../src/services/tenant/TenantContext';

describe('MetricsCollector', () => {
  let metricsCollector: MetricsCollector;
  let mockRedisClient: jest.Mocked<RedisClient>;
  let mockTenantContext: jest.Mocked<TenantContext>;

  beforeEach(() => {
    mockRedisClient = {
      pipeline: jest.fn().mockReturnThis(),
      zadd: jest.fn().mockReturnThis(),
      hincrby: jest.fn().mockReturnThis(),
      hincrbyfloat: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
      hgetall: jest.fn(),
      zcard: jest.fn(),
      zrange: jest.fn()
    } as any;

    mockTenantContext = {
      getCurrentTenant: jest.fn().mockReturnValue('test-tenant-1')
    } as any;

    metricsCollector = new MetricsCollector(mockRedisClient, mockTenantContext);
  });

  test('should track metric with proper tenant isolation', async () => {
    const metricData = {
      name: 'test-metric',
      value: 42,
      tags: { service: 'ai-command' }
    };

    await metricsCollector.trackMetric(metricData);

    expect(mockTenantContext.getCurrentTenant).toHaveBeenCalled();
    expect(mockRedisClient.pipeline).toHaveBeenCalled();
    expect(mockRedisClient.exec).toHaveBeenCalled();
  });

  test('should retrieve metrics with correct bucketing', async () => {
    const mockData = {
      count: '10',
      sum: '420',
      min: '35',
      max: '50'
    };

    mockRedisClient.hgetall.mockResolvedValue(mockData);
    mockRedisClient.zcard.mockResolvedValue(10);
    mockRedisClient.zrange.mockResolvedValue(['42']);

    const result = await metricsCollector.getMetrics('test-metric', {
      granularity: 'hour',
      range: {
        start: Date.now() - 3600000,
        end: Date.now()
      }
    });

    expect(result[0]).toMatchObject({
      count: 10,
      sum: 420,
      min: 35,
      max: 50,
      avg: 42
    });
  });

  test('should handle missing metrics data', async () => {
    mockRedisClient.hgetall.mockResolvedValue(null);

    const result = await metricsCollector.getMetrics('missing-metric', {
      granularity: 'hour',
      range: {
        start: Date.now() - 3600000,
        end: Date.now()
      }
    });

    expect(result).toHaveLength(0);
  });

  test('should calculate p95 correctly', async () => {
    mockRedisClient.zcard.mockResolvedValue(100);
    mockRedisClient.zrange.mockResolvedValue(['95thValue', '475']);

    const result = await metricsCollector.getMetrics('test-metric', {
      granularity: 'minute',
      range: {
        start: Date.now() - 60000,
        end: Date.now()
      }
    });

    expect(result[0].p95).toBe(475);
    expect(mockRedisClient.zrange).toHaveBeenCalledWith(
      expect.any(String),
      94,  // 95th percentile index for 100 values
      94,
      'WITHSCORES'
    );
  });

  test('should handle tag filtering correctly', async () => {
    const metricData = {
      name: 'test-metric',
      value: 42,
      tags: {
        service: 'ai-command',
        environment: 'test'
      }
    };

    await metricsCollector.trackMetric(metricData);

    expect(mockRedisClient.hset).toHaveBeenCalledWith(
      expect.stringContaining('tags:'),
      'service',
      'ai-command'
    );
    expect(mockRedisClient.hset).toHaveBeenCalledWith(
      expect.stringContaining('tags:'),
      'environment',
      'test'
    );
  });

  test('should respect TTL based on granularity', async () => {
    await metricsCollector.trackMetric({
      name: 'test-metric',
      value: 42
    });

    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      expect.stringContaining('minute'),
      3600 // 1 hour TTL for minute-level data
    );
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      expect.stringContaining('hour'),
      86400 // 24 hour TTL for hour-level data
    );
    expect(mockRedisClient.expire).toHaveBeenCalledWith(
      expect.stringContaining('day'),
      2592000 // 30 day TTL for day-level data
    );
  });

  test('should handle error cases gracefully', async () => {
    mockRedisClient.exec.mockRejectedValueOnce(new Error('Redis error'));

    const promise = metricsCollector.trackMetric({
      name: 'test-metric',
      value: 42
    });

    await expect(promise).resolves.toBe(false);
  });
});