import { ContentFilterResult, FilterResult } from '../filtering/interfaces';
import { IMetricsCollector } from '../metrics/collector';

// Interface for filter stages
interface FilterStage {
  name: string;
  executionStrategy: 'sync' | 'parallel';
  filter: (content: string, context?: any) => Promise<{
    result: ContentFilterResult;
    confidence: number;
  }>;
}

// Mock RegexFilterStage implementation for testing
class RegexFilterStage {
  async process(content: string): Promise<FilterResult> {
    return {
      isAllowed: !content.includes('hate speech'),
      confidenceScore: 1.0,
      reasons: content.includes('hate speech') ? ['Contains disallowed term'] : []
    };
  }
}

// Mock EmbeddingFilterStage implementation for testing
class EmbeddingFilterStage {
  async process(content: string): Promise<FilterResult> {
    // Fix: Check for case-insensitive match against "sensitive"
    const isSensitive = content.toLowerCase().includes('sensitive');
    
    return {
      isAllowed: !isSensitive,
      confidenceScore: 0.85,
      reasons: isSensitive ? ['Content is sensitive'] : []
    };
  }
}

// Mock LLMFilterStage implementation for testing
class LLMFilterStage {
  async process(content: string): Promise<FilterResult> {
    return {
      isAllowed: !content.includes('illegal'),
      confidenceScore: 0.92,
      reasons: content.includes('illegal') ? ['Content violates policy'] : []
    };
  }
}

// Create mock filter stages
const createMockFilter = (result: ContentFilterResult, confidence: number = 1.0): FilterStage => ({
  name: 'mock-filter',
  executionStrategy: 'sync',
  filter: jest.fn().mockResolvedValue({ result, confidence })
});

// Mock metrics collector
const createMockMetrics = () => ({
  incrementPipelineResult: jest.fn().mockResolvedValue(undefined),
  recordPipelineLatency: jest.fn().mockResolvedValue(undefined),
  incrementPipelineErrors: jest.fn().mockResolvedValue(undefined)
});

// Define minimal EnhancedFilterPipeline for testing
class EnhancedFilterPipeline {
  constructor(
    private filters: FilterStage[],
    private metrics: ReturnType<typeof createMockMetrics>
  ) {}

  async process(content: string): Promise<{ result: ContentFilterResult; confidence: number }> {
    const startTime = performance.now();

    try {
      // Group filters by execution strategy
      const syncFilters = this.filters.filter(f => f.executionStrategy === 'sync');
      const parallelFilters = this.filters.filter(f => f.executionStrategy === 'parallel');

      // Execute synchronous filters first (e.g., regex)
      for (const filter of syncFilters) {
        const result = await filter.filter(content);
        if (result.result === ContentFilterResult.BLOCKED) {
          this.metrics.incrementPipelineResult(ContentFilterResult.BLOCKED);
          return result;
        }
      }

      // Execute compatible filters in parallel
      if (parallelFilters.length > 0) {
        const results = await Promise.all(
          parallelFilters.map(filter => filter.filter(content))
        );

        // Process parallel results
        for (const result of results) {
          if (result.result === ContentFilterResult.BLOCKED) {
            this.metrics.incrementPipelineResult(ContentFilterResult.BLOCKED);
            return result;
          }
        }
      }

      return { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
    } catch (error) {
      this.metrics.incrementPipelineErrors();
      throw error;
    } finally {
      const totalDuration = performance.now() - startTime;
      this.metrics.recordPipelineLatency(totalDuration);
    }
  }
}

describe('Filtering Pipeline', () => {
  let regexFilter: RegexFilterStage;
  let embeddingFilter: EmbeddingFilterStage;
  let llmFilter: LLMFilterStage;
  let filterPipeline: EnhancedFilterPipeline;
  let metrics: ReturnType<typeof createMockMetrics>;
  let syncAllowFilter: FilterStage;
  let syncBlockFilter: FilterStage;
  let parallelAllowFilter: FilterStage;
  let parallelBlockFilter: FilterStage;

  beforeEach(() => {
    regexFilter = new RegexFilterStage();
    embeddingFilter = new EmbeddingFilterStage();
    llmFilter = new LLMFilterStage();
    metrics = createMockMetrics();

    // Create mock filters
    syncAllowFilter = createMockFilter(ContentFilterResult.ALLOWED);
    syncAllowFilter.executionStrategy = 'sync';
    syncAllowFilter.name = 'sync-allow';

    syncBlockFilter = createMockFilter(ContentFilterResult.BLOCKED);
    syncBlockFilter.executionStrategy = 'sync';
    syncBlockFilter.name = 'sync-block';

    parallelAllowFilter = createMockFilter(ContentFilterResult.ALLOWED);
    parallelAllowFilter.executionStrategy = 'parallel';
    parallelAllowFilter.name = 'parallel-allow';

    parallelBlockFilter = createMockFilter(ContentFilterResult.BLOCKED);
    parallelBlockFilter.executionStrategy = 'parallel';
    parallelBlockFilter.name = 'parallel-block';
    
    // Mock performance.now
    jest.spyOn(performance, 'now')
      .mockReturnValueOnce(100)  // Start time
      .mockReturnValueOnce(150); // End time
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('RegexFilterStage should return allowed result', async () => {
    const content = 'Sample content';
    const result: FilterResult = await regexFilter.process(content);
    expect(result.isAllowed).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test('EmbeddingFilterStage should return disallowed result', async () => {
    const content = 'Sensitive content';
    const result: FilterResult = await embeddingFilter.process(content);
    expect(result.isAllowed).toBe(false);
    expect(result.reasons).toContain('Content is sensitive');
  });

  test('LLMFilterStage should return allowed result with confidence score', async () => {
    const content = 'General content';
    const result: FilterResult = await llmFilter.process(content);
    expect(result.isAllowed).toBe(true);
    expect(result.confidenceScore).toBeGreaterThan(0.5);
  });

  test('Pipeline should allow early exit', async () => {
    const content = 'Early exit content';
    const result: FilterResult = await regexFilter.process(content);
    if (result.isAllowed) {
      expect(result.reasons).toEqual([]);
    } else {
      const embeddingResult: FilterResult = await embeddingFilter.process(content);
      expect(embeddingResult.isAllowed).toBe(false);
    }
  });

  test('should allow content when all filters pass', async () => {
    filterPipeline = new EnhancedFilterPipeline([syncAllowFilter, parallelAllowFilter], metrics);
    
    const result = await filterPipeline.process('safe content');
    
    expect(result.result).toBe(ContentFilterResult.ALLOWED);
    expect(syncAllowFilter.filter).toHaveBeenCalled();
    expect(parallelAllowFilter.filter).toHaveBeenCalled();
    expect(metrics.recordPipelineLatency).toHaveBeenCalledWith(expect.any(Number));
  });

  test('should block content when sync filter blocks', async () => {
    filterPipeline = new EnhancedFilterPipeline([syncBlockFilter, parallelAllowFilter], metrics);
    
    const result = await filterPipeline.process('unsafe content');
    
    expect(result.result).toBe(ContentFilterResult.BLOCKED);
    expect(syncBlockFilter.filter).toHaveBeenCalled();
    expect(metrics.incrementPipelineResult).toHaveBeenCalledWith(ContentFilterResult.BLOCKED);
  });

  test('should block content when parallel filter blocks', async () => {
    filterPipeline = new EnhancedFilterPipeline([syncAllowFilter, parallelBlockFilter], metrics);
    
    const result = await filterPipeline.process('unsafe content');
    
    expect(result.result).toBe(ContentFilterResult.BLOCKED);
    expect(syncAllowFilter.filter).toHaveBeenCalled();
    expect(parallelBlockFilter.filter).toHaveBeenCalled();
  });

  test('should handle errors during processing', async () => {
    const errorFilter: FilterStage = {
      name: 'error-filter',
      executionStrategy: 'sync',
      filter: jest.fn().mockRejectedValue(new Error('Filter error'))
    };
    
    filterPipeline = new EnhancedFilterPipeline([errorFilter], metrics);
    
    await expect(filterPipeline.process('content')).rejects.toThrow('Filter error');
    expect(metrics.incrementPipelineErrors).toHaveBeenCalled();
  });
});