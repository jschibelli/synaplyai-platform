import { MetricsCollector } from '../metrics/metrics-collector';
import { FeatureFlagService } from '../features/flag-service';
import { FilterResult, FilterDecision } from './interfaces';
import { RegexFilter } from './regex-filter';
import { EmbeddingFilter } from './embedding-filter';
import { LLMFilter } from './llm-filter';
import { ContentFilter, ContentFilterPipeline, FilterResponse, ContentFilterResult } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';
import { getCurrentTenantId } from '../lib/tenant-context';

export enum FilterDecision {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  UNKNOWN = 'UNKNOWN'
}

export interface FilterResult {
  decision: FilterDecision;
  confidence: number;
  source: string;
  details?: any;
}

export interface ContentFilter {
  evaluate(content: string): Promise<FilterResult>;
}

export class FilteringPipeline {
  constructor(
    private regexFilter: RegexFilter,
    private embeddingFilter: EmbeddingFilter,
    private llmFilter: LLMFilter,
    private metricsCollector?: any,
    private featureFlagService?: FeatureFlagService
  ) {}

  async process(content: string, tenantId: string): Promise<FilterResult> {
    const startTime = Date.now();
    
    try {
      // Stage 1: Always run regex filter (fast)
      const regexResult = await this.regexFilter.evaluate(content);
      
      if (this.metricsCollector) {
        await this.metricsCollector.recordLatency('filter.regex', Date.now() - startTime, tenantId);
      }
      
      if (regexResult.decision !== FilterDecision.UNKNOWN) {
        return regexResult;
      }
      
      // Stage 2: Feature-flagged embedding filter
      const useEmbedding = !this.featureFlagService || 
                          await this.featureFlagService.isEnabled('ENABLE_EMBEDDING_CHECKS', tenantId);
      
      if (useEmbedding) {
        const embeddingStartTime = Date.now();
        try {
          const embeddingResult = await this.embeddingFilter.evaluate(content);
          
          if (this.metricsCollector) {
            await this.metricsCollector.recordLatency('filter.embedding', 
                                                    Date.now() - embeddingStartTime, 
                                                    tenantId);
          }
          
          if (embeddingResult.decision !== FilterDecision.UNKNOWN) {
            return embeddingResult;
          }
        } catch (error) {
          console.error('Error in embedding filter:', error);
          if (this.metricsCollector) {
            await this.metricsCollector.increment('filter.embedding.error', tenantId);
          }
        }
      }
      
      // Stage 3: Feature-flagged LLM filter with timeout
      const useLLM = !this.featureFlagService || 
                    await this.featureFlagService.isEnabled('ENABLE_LLM_CHECKS', tenantId);
      
      if (useLLM) {
        const llmStartTime = Date.now();
        try {
          // Add timeout protection
          const llmResult = await Promise.race([
            this.llmFilter.evaluate(content),
            new Promise<FilterResult>((resolve) => {
              setTimeout(() => {
                resolve({
                  decision: FilterDecision.UNKNOWN,
                  confidence: 0,
                  source: 'llm_timeout'
                });
              }, 5000); // 5-second timeout
            })
          ]);
          
          if (this.metricsCollector) {
            await this.metricsCollector.recordLatency('filter.llm', 
                                                    Date.now() - llmStartTime, 
                                                    tenantId);
          }
          
          return llmResult;
        } catch (error) {
          console.error('Error in LLM filter:', error);
          if (this.metricsCollector) {
            await this.metricsCollector.increment('filter.llm.error', tenantId);
          }
        }
      }
      
      // Default case: no decision
      return {
        decision: FilterDecision.UNKNOWN,
        confidence: 0,
        source: 'pipeline_default'
      };
    } finally {
      if (this.metricsCollector) {
        await this.metricsCollector.recordLatency('filter.total', Date.now() - startTime, tenantId);
      }
    }
  }
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
    const startTime = Date.now();
    const tenantId = getCurrentTenantId();
    
    try {
      // Group filters by execution strategy
      const synchronousFilters = this.filters.filter(f => f.executionStrategy === 'sync');
      const parallelFilters = this.filters.filter(f => f.executionStrategy === 'parallel');
      const postFilters = this.filters.filter(f => f.executionStrategy === 'post');

      // Execute synchronous filters first (e.g., regex)
      for (const filter of synchronousFilters) {
        // Record filter-specific timing
        const filterStartTime = Date.now();
        
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
          const filterDuration = Date.now() - filterStartTime;
          this.metrics.recordFilterLatency(filter.name, filterDuration);
          this.metrics.incrementFilterResult(filter.name, result.result);
          
          // Early exit if content is blocked
          if (result.result === ContentFilterResult.BLOCKED) {
            this.logBlockedContent(result, filter.name);
            return result;
          }
        } catch (error) {
          // Handle filter timeout/error
          const filterDuration = Date.now() - filterStartTime;
          this.metrics.recordFilterLatency(filter.name, filterDuration);
          this.metrics.incrementFilterResult(filter.name, ContentFilterResult.ERROR);
          console.error(`Filter ${filter.name} error:`, error);
        }
      }

      // Execute compatible filters in parallel if any
      if (parallelFilters.length > 0) {
        const parallelStartTime = Date.now();
        
        try {
          const parallelResults = await Promise.allSettled(
            parallelFilters.map(async (filter) => {
              const filterStartTime = Date.now();
              
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
                const filterDuration = Date.now() - filterStartTime;
                this.metrics.recordFilterLatency(filter.name, filterDuration);
                this.metrics.incrementFilterResult(filter.name, result.result);
                
                return { filter: filter.name, result };
              } catch (error) {
                // Handle filter timeout/error
                const filterDuration = Date.now() - filterStartTime;
                this.metrics.recordFilterLatency(filter.name, filterDuration);
                this.metrics.incrementFilterResult(filter.name, ContentFilterResult.ERROR);
                throw error;
              }
            })
          );
          
          // Process the results
          for (const result of parallelResults) {
            if (result.status === 'fulfilled' && 
                result.value.result.result === ContentFilterResult.BLOCKED) {
              this.logBlockedContent(result.value.result, result.value.filter);
              return result.value.result;
            }
          }
          
          // Record parallel execution metrics
          const parallelDuration = Date.now() - parallelStartTime;
          this.metrics.recordValue('filter.parallel.duration', parallelDuration);
        } catch (error) {
          console.error('Error in parallel filter execution:', error);
        }
      }

      // Execute post-filters (always run these)
      for (const filter of postFilters) {
        // Similar logic as synchronous filters
        const filterStartTime = Date.now();
        
        try {
          const result = await Promise.race([
            filter.filter(content, context),
            new Promise<FilterResponse>((_, reject) => {
              setTimeout(() => reject(new Error(`Filter ${filter.name} timed out`)), 
                filter.timeoutMs || 5000);
            })
          ]);
          
          const filterDuration = Date.now() - filterStartTime;
          this.metrics.recordFilterLatency(filter.name, filterDuration);
          this.metrics.incrementFilterResult(filter.name, result.result);
          
          if (result.result === ContentFilterResult.BLOCKED) {
            this.logBlockedContent(result, filter.name);
            return result;
          }
        } catch (error) {
          const filterDuration = Date.now() - filterStartTime;
          this.metrics.recordFilterLatency(filter.name, filterDuration);
          this.metrics.incrementFilterResult(filter.name, ContentFilterResult.ERROR);
          console.error(`Filter ${filter.name} error:`, error);
        }
      }

      // Record overall pipeline metrics
      const totalDuration = Date.now() - startTime;
      this.metrics.recordPipelineLatency(totalDuration);
      this.metrics.incrementPipelineResult(ContentFilterResult.ALLOWED);
      
      // All filters passed, content is allowed
      return { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
    } catch (error) {
      // Log any errors
      const totalDuration = Date.now() - startTime;
      this.metrics.recordPipelineLatency(totalDuration);
      this.metrics.incrementPipelineErrors();
      
      await ComplianceLogger.log({
        eventType: 'content.filter.error',
        description: 'Error in content filtering pipeline',
        metadata: {
          error: error instanceof Error ? error.message : String(error),
          tenantId
        }
      });
      
      // Default to allowed in case of system error
      return { result: ContentFilterResult.ALLOWED, confidence: 0.5 };
    }
  }
  
  private async logBlockedContent(result: FilterResponse, filterName: string): Promise<void> {
    await ComplianceLogger.log({
      eventType: 'content.blocked',
      description: 'Content blocked by content filtering pipeline',
      metadata: {
        reason: result.reason,
        confidence: result.confidence,
        filter: filterName
      }
    });
  }
}