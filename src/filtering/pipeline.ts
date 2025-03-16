import { MetricsCollector } from '../metrics/collector';
import { FeatureFlagService } from '../features/flag-service';
import { FilterResult, FilterDecision } from './interfaces';
import { RegexFilter } from './regex-filter';
import { EmbeddingFilter } from './embedding-filter';
import { LLMFilter } from './llm-filter';

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