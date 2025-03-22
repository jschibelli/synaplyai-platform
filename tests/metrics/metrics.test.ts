import { MetricsCollector } from '../../src/lib/metrics';
import { tenantContextStorage, TenantContext } from '../../src/lib/tenant-context';

describe('Metrics Collection', () => {
  let metrics: MetricsCollector;
  const testContext: TenantContext = {
    tenantId: 'test-tenant',
    userId: 'test-user',
    requestId: 'test-request',
    traceId: 'test-trace'
  };

  beforeEach(() => {
    metrics = MetricsCollector.getInstance();
    metrics.clear();
  });

  it('should track metrics with tenant context', async () => {
    await tenantContextStorage.run(testContext, async () => {
      metrics.track('test_metric', 1);
      
      const collected = metrics.getMetrics();
      expect(collected).toHaveLength(1);
      expect(collected[0]).toMatchObject({
        name: 'test_metric',
        value: 1,
        tags: {
          tenantId: 'test-tenant',
          userId: 'test-user'
        }
      });
    });
  });

  it('should handle missing tenant context', () => {
    metrics.track('test_metric', 1);
    
    const collected = metrics.getMetrics();
    expect(collected[0].tags).toMatchObject({
      tenantId: 'unknown',
      userId: 'anonymous'
    });
  });

  it('should support additional tags', async () => {
    await tenantContextStorage.run(testContext, async () => {
      metrics.track('test_metric', 1, { category: 'test' });
      
      const collected = metrics.getMetrics();
      expect(collected[0].tags).toMatchObject({
        tenantId: 'test-tenant',
        userId: 'test-user',
        category: 'test'
      });
    });
  });
});