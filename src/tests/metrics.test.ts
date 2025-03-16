Sure, here's the contents for the file `/compliance-framework/compliance-framework/src/tests/metrics.test.ts`:

import { MetricsCollector } from '../metrics/collector';
import { RedisClient } from '../metrics/redis-client';

jest.mock('../metrics/redis-client');

describe('MetricsCollector', () => {
    let metricsCollector: MetricsCollector;
    let redisClient: RedisClient;

    beforeEach(() => {
        redisClient = new RedisClient();
        metricsCollector = new MetricsCollector(redisClient);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    test('should increment minute metrics', async () => {
        const tenantId = 'tenant1';
        await metricsCollector.incrementMinuteMetric(tenantId);
        expect(redisClient.increment).toHaveBeenCalledWith(`metrics:${tenantId}:minute`, 1);
    });

    test('should increment hour metrics', async () => {
        const tenantId = 'tenant1';
        await metricsCollector.incrementHourMetric(tenantId);
        expect(redisClient.increment).toHaveBeenCalledWith(`metrics:${tenantId}:hour`, 1);
    });

    test('should increment day metrics', async () => {
        const tenantId = 'tenant1';
        await metricsCollector.incrementDayMetric(tenantId);
        expect(redisClient.increment).toHaveBeenCalledWith(`metrics:${tenantId}:day`, 1);
    });

    test('should aggregate metrics across time buckets', async () => {
        const tenantId = 'tenant1';
        await metricsCollector.incrementMinuteMetric(tenantId);
        await metricsCollector.incrementHourMetric(tenantId);
        await metricsCollector.incrementDayMetric(tenantId);

        const aggregatedMetrics = await metricsCollector.aggregateMetrics(tenantId);
        expect(aggregatedMetrics).toEqual({
            minute: expect.any(Number),
            hour: expect.any(Number),
            day: expect.any(Number),
        });
    });
});