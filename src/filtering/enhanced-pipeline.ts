import { ContentFilter, FilterResponse, ContentFilterResult } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/collector';

export enum ExecutionStrategy {
  SYNC = 'sync',         // Execute synchronously (e.g., regex filters)
  PARALLEL = 'parallel', // Can be executed in parallel with others
  FALLBACK = 'fallback'  // Only executed if others fail
}

export interface EnhancedContentFilter extends ContentFilter {
  executionStrategy: ExecutionStrategy;
  priority: number;     // Lower numbers run first within their strategy group
  timeoutMs?: number;   // Max execution time before timing out
}

export class EnhancedFilterPipeline {
  private filters: EnhancedContentFilter[] = [];
  private metrics: MetricsCollector;
  
  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
  }
  
  addFilter(filter: EnhancedContentFilter): EnhancedFilterPipeline {
    this.filters.push(filter);
    // Sort by execution strategy and priority
    this.filters.sort((a, b) => {
      // Sort by strategy first
      if (a.executionStrategy !== b.executionStrategy) {
        if (a.executionStrategy === ExecutionStrategy.SYNC) return -1;
        if (b.executionStrategy === ExecutionStrategy.SYNC) return 1;
        if (a.executionStrategy === ExecutionStrategy.PARALLEL) return -1;
        return 1;
      }
      
      // Then by priority
      return a.priority - b.priority;
    });
    
    return this;
  }
  
  async process(content: string, context?: Record<string, any>): Promise<FilterResponse> {
    const startTime = performance.now();

    try {
      // Group filters by execution strategy
      const syncFilters = this.filters.filter(f => f.executionStrategy === ExecutionStrategy.SYNC);
      const parallelFilters = this.filters.filter(f => f.executionStrategy === ExecutionStrategy.PARALLEL);
      const fallbackFilters = this.filters.filter(f => f.executionStrategy === ExecutionStrategy.FALLBACK);

      // Execute synchronous filters first (e.g., regex) with early exit for definitive results
      for (const filter of syncFilters) {
        const filterStartTime = performance.now();
        
        try {
          const result = await this.executeFilterWithTimeout(filter, content, context);
          
          // Record per-filter metrics
          const filterDuration = performance.now() - filterStartTime;
          this.metrics.recordFilterLatency(filter.name, filterDuration);
          this.metrics.incrementFilterResult(filter.name, result.result);
          
          // Early exit if a definitive BLOCKED result is found
          if (result.result === ContentFilterResult.BLOCKED) {
            // Log the blocked content
            await ComplianceLogger.log({
              eventType: 'content.blocked',
              description: `Content blocked by filter: ${filter.name}`,
              metadata: {
                filterName: filter.name,
                reason: result.reason,
                confidence: result.confidence
              }
            });
            
            // Record overall pipeline metrics
            const totalDuration = performance.now() - startTime;
            this.metrics.recordPipelineLatency(totalDuration);
            this.metrics.incrementPipelineResult(ContentFilterResult.BLOCKED);
            
            return result;
          }
        } catch (error) {
          // Log filter errors but continue processing
          console.error(`Error in filter ${filter.name}:`, error);
          this.metrics.incrementPipelineErrors();
        }
      }

      // Execute compatible filters in parallel with early exit for definitive results
      if (parallelFilters.length > 0) {
        const filterPromises = parallelFilters.map(async filter => {
          const filterStartTime = performance.now();
          
          try {
            const result = await this.executeFilterWithTimeout(filter, content, context);
            
            // Record per-filter metrics
            const filterDuration = performance.now() - filterStartTime;
            this.metrics.recordFilterLatency(filter.name, filterDuration);
            this.metrics.incrementFilterResult(filter.name, result.result);
            
            return { filter, result };
          } catch (error) {
            // Log filter errors but continue with other filters
            console.error(`Error in filter ${filter.name}:`, error);
            this.metrics.incrementPipelineErrors();
            return null;
          }
        });
        
        const results = await Promise.all(filterPromises);
        
        // Process parallel results, prioritizing BLOCKED results
        const blockedResult = results
          .filter(r => r !== null && r.result.result === ContentFilterResult.BLOCKED)
          .sort((a, b) => b!.result.confidence - a!.result.confidence)[0];
        
        if (blockedResult) {
          // Log the blocked content
          await ComplianceLogger.log({
            eventType: 'content.blocked',
            description: `Content blocked by filter: ${blockedResult.filter.name}`,
            metadata: {
              filterName: blockedResult.filter.name,
              reason: blockedResult.result.reason,
              confidence: blockedResult.result.confidence
            }
          });
          
          // Record overall pipeline metrics
          const totalDuration = performance.now() - startTime;
          this.metrics.recordPipelineLatency(totalDuration);
          this.metrics.incrementPipelineResult(ContentFilterResult.BLOCKED);
          
          return blockedResult.result;
        }
        
        // If we have any FLAGGED results, take the one with highest confidence
        const flaggedResult = results
          .filter(r => r !== null && r.result.result === ContentFilterResult.FLAGGED)
          .sort((a, b) => b!.result.confidence - a!.result.confidence)[0];
        
        if (flaggedResult) {
          // Log the flagged content
          await ComplianceLogger.log({
            eventType: 'content.flagged',
            description: `Content flagged by filter: ${flaggedResult.filter.name}`,
            metadata: {
              filterName: flaggedResult.filter.name,
              reason: flaggedResult.result.reason,
              confidence: flaggedResult.result.confidence
            }
          });
          
          // Record overall pipeline metrics
          const totalDuration = performance.now() - startTime;
          this.metrics.recordPipelineLatency(totalDuration);
          this.metrics.incrementPipelineResult(ContentFilterResult.FLAGGED);
          
          return flaggedResult.result;
        }
      }

      // If we reach here, no definitive result from sync or parallel filters
      // Try fallback filters if we have any
      for (const filter of fallbackFilters) {
        const filterStartTime = performance.now();
        
        try {
          const result = await this.executeFilterWithTimeout(filter, content, context);
          
          // Record per-filter metrics
          const filterDuration = performance.now() - filterStartTime;
          this.metrics.recordFilterLatency(filter.name, filterDuration);
          this.metrics.incrementFilterResult(filter.name, result.result);
          
          if (result.result !== ContentFilterResult.ALLOWED) {
            // Record overall pipeline metrics
            const totalDuration = performance.now() - startTime;
            this.metrics.recordPipelineLatency(totalDuration);
            this.metrics.incrementPipelineResult(result.result);
            
            // Log non-allowed results
            await ComplianceLogger.log({
              eventType: result.result === ContentFilterResult.BLOCKED ? 'content.blocked' : 'content.flagged',
              description: `Content ${result.result.toLowerCase()} by fallback filter: ${filter.name}`,
              metadata: {
                filterName: filter.name,
                reason: result.reason,
                confidence: result.confidence
              }
            });
            
            return result;
          }
        } catch (error) {
          // Log filter errors but continue processing
          console.error(`Error in filter ${filter.name}:`, error);
          this.metrics.incrementPipelineErrors();
        }
      }

      // If we got here, all filters either allowed the content or errored
      // Record metrics and return ALLOWED
      const totalDuration = performance.now() - startTime;
      this.metrics.recordPipelineLatency(totalDuration);
      this.metrics.incrementPipelineResult(ContentFilterResult.ALLOWED);
      
      return { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
    } catch (error) {
      // Log any unexpected errors in the pipeline itself
      console.error("Error in filter pipeline:", error);
      this.metrics.incrementPipelineErrors();
      
      await ComplianceLogger.log({
        eventType: 'content.filter.error',
        description: 'Error in content filtering pipeline',
        metadata: { error: (error as Error).message }
      });
      
      // Fail open for UX, but log the error
      return { 
        result: ContentFilterResult.ALLOWED, 
        confidence: 0.5,
        reason: 'Error in content filtering pipeline'
      };
    }
  }
  
  private executeFilterWithTimeout(
    filter: EnhancedContentFilter, 
    content: string, 
    context?: Record<string, any>
  ): Promise<FilterResponse> {
    const timeout = filter.timeoutMs || 5000; // Default 5 second timeout
    
    return Promise.race([
      filter.filter(content, context),
      new Promise<FilterResponse>((_, reject) => {
        setTimeout(() => reject(new Error(`Filter ${filter.name} timed out after ${timeout}ms`)), timeout);
      })
    ]);
  }
}