import { MetricsCollector } from '../metrics/collector';
import { ComplianceLogger } from '../compliance/logger';
import { getTenantContext } from '../lib/tenant-context';

export enum ContentFilterResult {
  ALLOWED = 'allowed',
  FLAGGED = 'flagged',
  BLOCKED = 'blocked',
  ERROR = 'error'
}

export interface FilterResponse {
  result: ContentFilterResult;
  confidence?: number;
  reason?: string;
  metadata?: Record<string, any>;
}

export type ExecutionStrategy = 'sync' | 'parallel' | 'post';

export interface ContentFilter {
  name: string;
  executionStrategy: ExecutionStrategy;
  timeoutMs?: number;
  filter(content: string, context?: Record<string, any>): Promise<FilterResponse>;
}

export interface ContentFilterPipeline {
  process(content: string, context?: Record<string, any>): Promise<FilterResponse>;
}

export class MultiStageFilterPipeline implements ContentFilterPipeline {
  private filters: ContentFilter[];
  private metrics: MetricsCollector;
  
  constructor(filters: ContentFilter[], metrics: MetricsCollector) {
    this.filters = filters;
    this.metrics = metrics;
  }

  async process(content: string, context?: Record<string, any>): Promise<FilterResponse> {
    // Return early for empty content
    if (!content || content.trim().length === 0) {
      return { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
    }
    
    // Track start time for metrics
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    try {
      // Group filters by execution strategy
      const synchronousFilters = this.filters.filter(f => f.executionStrategy === 'sync');
      const parallelFilters = this.filters.filter(f => f.executionStrategy === 'parallel');
      const postFilters = this.filters.filter(f => f.executionStrategy === 'post');

      // Execute synchronous filters first (e.g., regex patterns - fast, cheap)
      for (const filter of synchronousFilters) {
        // Record filter-specific timing
        const filterStartTime = performance.now();
        
        try {
          // Run the filter with timeout protection
          const result = await Promise.race([
            filter.filter(content, context),
            new Promise<FilterResponse>((_, reject) => {
              setTimeout(() => reject(new Error(`Filter ${filter.name} timed out`)), 
                filter.timeoutMs || 5000);
            })
          ]);
          
          // Record filter-specific metrics
          const filterDuration = performance.now() - filterStartTime;
          this.metrics.recordValue(`filter.latency.${filter.name}`, filterDuration, { 
            tenantId: tenantContext?.tenantId 
          });
          this.metrics.incrementCounter(`filter.result.${filter.name}.${result.result}`, { 
            tenantId: tenantContext?.tenantId 
          });
          
          // Early exit if content is blocked - avoid unnecessary processing
          if (result.result === ContentFilterResult.BLOCKED) {
            this.logFilterResult(result, filter.name, content);
            return result;
          }
        } catch (error) {
          // Handle filter timeout/error
          const filterDuration = performance.now() - filterStartTime;
          this.metrics.recordValue(`filter.latency.${filter.name}`, filterDuration, { 
            tenantId: tenantContext?.tenantId 
          });
          this.metrics.incrementCounter(`filter.result.${filter.name}.error`, { 
            tenantId: tenantContext?.tenantId 
          });
          console.error(`Filter ${filter.name} error:`, error);
        }
      }

      // Execute compatible filters in parallel if any
      if (parallelFilters.length > 0) {
        const parallelStartTime = performance.now();
        
        try {
          const parallelResults = await Promise.allSettled(
            parallelFilters.map(async (filter) => {
              const filterStartTime = performance.now();
              
              try {
                // Run with timeout protection
                const result = await Promise.race([
                  filter.filter(content, context),
                  new Promise<FilterResponse>((_, reject) => {
                    setTimeout(() => reject(new Error(`Filter ${filter.name} timed out`)), 
                      filter.timeoutMs || 5000);
                  })
                ]);
                
                // Record metrics
                const filterDuration = performance.now() - filterStartTime;
                this.metrics.recordValue(`filter.latency.${filter.name}`, filterDuration, { 
                  tenantId: tenantContext?.tenantId 
                });
                this.metrics.incrementCounter(`filter.result.${filter.name}.${result.result}`, { 
                  tenantId: tenantContext?.tenantId 
                });
                
                return { filter: filter.name, result };
              } catch (error) {
                // Handle filter timeout/error
                const filterDuration = performance.now() - filterStartTime;
                this.metrics.recordValue(`filter.latency.${filter.name}`, filterDuration, { 
                  tenantId: tenantContext?.tenantId 
                });
                this.metrics.incrementCounter(`filter.result.${filter.name}.error`, { 
                  tenantId: tenantContext?.tenantId 
                });
                throw error;
              }
            })
          );
          
          // Find the first blocking result
          for (const result of parallelResults) {
            if (result.status === 'fulfilled' && 
                result.value.result.result === ContentFilterResult.BLOCKED) {
              this.logFilterResult(result.value.result, result.value.filter, content);
              return result.value.result;
            }
          }
          
          // Record parallel execution metrics
          const parallelDuration = performance.now() - parallelStartTime;
          this.metrics.recordValue('filter.parallel.duration', parallelDuration, { 
            tenantId: tenantContext?.tenantId 
          });
        } catch (error) {
          console.error('Error in parallel filter execution:', error);
        }
      }

      // Execute post-filters (always run these, e.g. analytics, logging)
      for (const filter of postFilters) {
        const filterStartTime = performance.now();
        
        try {
          const result = await Promise.race([
            filter.filter(content, context),
            new Promise<FilterResponse>((_, reject) => {
              setTimeout(() => reject(new Error(`Filter ${filter.name} timed out`)), 
                filter.timeoutMs || 5000);
            })
          ]);
          
          const filterDuration = performance.now() - filterStartTime;
          this.metrics.recordValue(`filter.latency.${filter.name}`, filterDuration, { 
            tenantId: tenantContext?.tenantId 
          });
          this.metrics.incrementCounter(`filter.result.${filter.name}.${result.result}`, { 
            tenantId: tenantContext?.tenantId 
          });
          
          if (result.result === ContentFilterResult.BLOCKED) {
            this.logFilterResult(result, filter.name, content);
            return result;
          }
        } catch (error) {
          const filterDuration = performance.now() - filterStartTime;
          this.metrics.recordValue(`filter.latency.${filter.name}`, filterDuration, { 
            tenantId: tenantContext?.tenantId 
          });
          this.metrics.incrementCounter(`filter.result.${filter.name}.error`, { 
            tenantId: tenantContext?.tenantId 
          });
          console.error(`Filter ${filter.name} error:`, error);
        }
      }

      // Record overall pipeline metrics
      const totalDuration = performance.now() - startTime;
      this.metrics.recordValue('filter.pipeline.duration', totalDuration, { 
        tenantId: tenantContext?.tenantId 
      });
      this.metrics.incrementCounter('filter.pipeline.result.allowed', { 
        tenantId: tenantContext?.tenantId 
      });
      
      // All filters passed, content is allowed
      return { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
    } catch (error) {
      // Log any errors
      const totalDuration = performance.now() - startTime;
      this.metrics.recordValue('filter.pipeline.duration', totalDuration, { 
        tenantId: tenantContext?.tenantId 
      });
      this.metrics.incrementCounter('filter.pipeline.errors', { 
        tenantId: tenantContext?.tenantId 
      });
      
      await ComplianceLogger.log({
        eventType: 'filter.error',
        description: 'Error in content filtering pipeline',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          tenantId: tenantContext?.tenantId
        }
      });
      
      // Default to allowed in case of system error
      return { result: ContentFilterResult.ALLOWED, confidence: 0.5 };
    }
  }
  
  private async logFilterResult(
    result: FilterResponse, 
    filterName: string, 
    content: string
  ): Promise<void> {
    await ComplianceLogger.log({
      eventType: 'content.filtered',
      description: `Content ${result.result} by filter ${filterName}`,
      metadata: {
        reason: result.reason,
        confidence: result.confidence,
        filter: filterName,
        contentLength: content.length,
        contentSnippet: content.substring(0, 100) + (content.length > 100 ? '...' : '')
      }
    });
  }
}