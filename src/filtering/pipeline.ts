import { MetricsCollector } from '../metrics/collector';
import { FeatureFlagService } from '../features/flag-service';
import { FilterResult, FilterDecision } from './interfaces';
import { RegexFilter } from './regex-filter';
import { EmbeddingFilter } from './embedding-filter';
import { LLMFilter } from './llm-filter';
import { ContentFilter, ContentFilterPipeline, FilterResponse, ContentFilterResult } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';

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
  private filters: ContentFilter[] = [];
  private metrics: MetricsCollector;
  
  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
  }
  
  addFilter(filter: ContentFilter): ContentFilterPipeline {
    this.filters.push(filter);
    return this;
  }
  
  getActiveFilters(): ContentFilter[] {
    return [...this.filters];
  }
  
  async process(content: string, context?: Record<string, any>): Promise<FilterResponse> {
    // Return early for empty content
    if (!content || content.trim().length === 0) {
      return { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
    }
    
    // Track start time for metrics
    const startTime = Date.now();
    
    try {
      // Process each filter in sequence
      let finalResult: FilterResponse = { result: ContentFilterResult.ALLOWED, confidence: 1.0 };
      
      for (const filter of this.filters) {
        // Measure filter-specific timing
        const filterStartTime = Date.now();
        
        // Run the filter
        const result = await filter.filter(content, context);
        
        // Record filter-specific metrics
        const filterDuration = Date.now() - filterStartTime;
        this.metrics.recordFilterLatency(filter.name, filterDuration);
        
        // Log filter result to metrics
        this.metrics.incrementFilterResult(filter.name, result.result);
        
        // If any filter blocks the content, return immediately
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
          const totalDuration = Date.now() - startTime;
          this.metrics.recordPipelineLatency(totalDuration);
          this.metrics.incrementPipelineResult(ContentFilterResult.BLOCKED);
          
          return result;
        }
        
        // If this filter flagged content and has higher confidence than previous flags,
        // update the final result
        if (
          result.result === ContentFilterResult.FLAGGED && 
          (finalResult.result !== ContentFilterResult.FLAGGED || result.confidence > finalResult.confidence)
        ) {
          finalResult = result;
        }
      }
      
      // Record overall pipeline metrics
      const totalDuration = Date.now() - startTime;
      this.metrics.recordPipelineLatency(totalDuration);
      this.metrics.incrementPipelineResult(finalResult.result);
      
      // If the final result is FLAGGED, log it
      if (finalResult.result === ContentFilterResult.FLAGGED) {
        await ComplianceLogger.log({
          eventType: 'content.flagged',
          description: 'Content flagged by content filtering pipeline',
          metadata: {
            reason: finalResult.reason,
            confidence: finalResult.confidence
          }
        });
      }
      
      return finalResult;
    } catch (error) {
      // Log any errors
      await ComplianceLogger.log({
        eventType: 'content.filter.error',
        description: 'Error in content filtering pipeline',
        metadata: { error: error.message }
      });
      
      // Record error in metrics
      this.metrics.incrementPipelineErrors();
      
      // Fail open for UX, but log the error
      return { 
        result: ContentFilterResult.ALLOWED, 
        confidence: 0.5,
        reason: 'Error in content filtering pipeline'
      };
    }
  }
}