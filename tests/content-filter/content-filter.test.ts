import { ContentFilter } from '../../src/services/ai/contentFilter';
import { tenantContextStorage, TenantContext } from '../../src/lib/tenant-context';

describe('Content Filter', () => {
  let contentFilter: ContentFilter;
  const testContext: TenantContext = {
    tenantId: 'test-tenant',
    userId: 'test-user',
    requestId: 'test-request',
    traceId: 'test-trace'
  };

  beforeEach(() => {
    contentFilter = new ContentFilter();
  });

  it('should block disallowed global terms', async () => {
    await tenantContextStorage.run(testContext, async () => {
      const result = await contentFilter.filterContent('This contains hate speech');
      expect(result.isAllowed).toBe(false);
      expect(result.reasons).toContain('Contains disallowed term: hate speech');
    });
  });

  it('should block tenant-specific terms', async () => {
    await tenantContextStorage.run({
      ...testContext,
      tenantId: 'tenant-1'
    }, async () => {
      const result = await contentFilter.filterContent('This is proprietary information');
      expect(result.isAllowed).toBe(false);
      expect(result.reasons).toContain('Contains tenant-specific disallowed term: proprietary');
    });
  });

  it('should allow valid content', async () => {
    await tenantContextStorage.run(testContext, async () => {
      const result = await contentFilter.filterContent('This is acceptable content');
      expect(result.isAllowed).toBe(true);
      expect(result.reasons).toHaveLength(0);
    });
  });
});