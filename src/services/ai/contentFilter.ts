import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId, getCurrentUserId } from 'src/lib/tenantContext';

const prisma = new PrismaClient();

export class ContentFilter {
  // Default disallowed terms - in a real app, these would be loaded from DB or config
  private static readonly DEFAULT_DISALLOWED_TERMS = [
    'hate speech',
    'illegal content',
    'violence',
    'explicit sexual content'
    // Add more disallowed terms as needed
  ];
  
  private disallowedTerms: string[];
  private customTerms: Map<string, string[]> = new Map();
  
  constructor(disallowedTerms: string[] = ContentFilter.DEFAULT_DISALLOWED_TERMS) {
    this.disallowedTerms = disallowedTerms;
    this.loadCustomTermsForTenant();
  }
  
  /**
   * Load tenant-specific disallowed terms
   * In a real app, these would come from a database
   */
  private async loadCustomTermsForTenant() {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;
    
    // In a real application, this would fetch from database
    // For now, we're just simulating tenant-specific terms
    this.customTerms.set('tenant-1', ['proprietary', 'confidential', 'internal-only']);
    this.customTerms.set('tenant-2', ['competitor-x', 'competitor-y', 'secret-project']);
  }
  
  /**
   * Check if content contains disallowed terms
   * @returns Object with isAllowed flag and reasons for filtering if applicable
   */
  async filterContent(content: string): Promise<{
    isAllowed: boolean;
    reasons: string[];
    filteredContent?: string;
  }> {
    const tenantId = getCurrentTenantId() || 'default-tenant';
    const userId = getCurrentUserId() || 'anonymous';
    let lowerContent = content.toLowerCase();
    const reasons: string[] = [];
    let isContentModified = false;
    
    // Check against global disallowed terms
    for (const term of this.disallowedTerms) {
      if (lowerContent.includes(term.toLowerCase())) {
        reasons.push(`Contains disallowed term: ${term}`);
      }
    }
    
    // Check against tenant-specific terms
    const tenantTerms = this.customTerms.get(tenantId) || [];
    for (const term of tenantTerms) {
      if (lowerContent.includes(term.toLowerCase())) {
        reasons.push(`Contains tenant-specific disallowed term: ${term}`);
      }
    }
    
    // Log the filtering event
    if (reasons.length > 0) {
      try {
        // In a real app, you would log to a database or monitoring system
        console.log(`[CONTENT-FILTER] Blocked content from tenant: ${tenantId}, user: ${userId}, reasons: ${reasons.join(', ')}`);
      } catch (error) {
        console.error('Failed to log content filtering:', error);
      }
    }
    
    return {
      isAllowed: reasons.length === 0,
      reasons,
      filteredContent: isContentModified ? lowerContent : undefined
    };
  }
}

export class EnhancedContentFilter extends ContentFilter {
  private embeddingCheck: boolean;
  private llmCheck: boolean;

  constructor(options: {
    embeddingCheck?: boolean;
    llmCheck?: boolean;
  } = {}) {
    super();
    this.embeddingCheck = options.embeddingCheck ?? false;
    this.llmCheck = options.llmCheck ?? false;
  }

  async filterContent(content: string): Promise<{
    isAllowed: boolean;
    reasons: string[];
    riskScore?: number;
  }> {
    // Basic regex check first (fast)
    const regexResult = await super.filterContent(content);
    if (!regexResult.isAllowed) {
      return regexResult;
    }

    // Embedding check if enabled
    if (this.embeddingCheck) {
      const embeddingResult = await this.checkEmbeddings(content);
      if (!embeddingResult.isAllowed) {
        return embeddingResult;
      }
    }

    // LLM check if enabled (most expensive)
    if (this.llmCheck) {
      return this.checkWithLLM(content);
    }

    return regexResult;
  }
}

// Add to src/services/ai/contentFilter.ts
interface FilterStage {
  priority: number;
  execute: (content: string) => Promise<FilterResult>;
  timeoutMs?: number;
}

export class EnhancedFilterPipeline {
  private stages: FilterStage[] = [];
  private metrics: MetricsCollector;

  constructor(metrics: MetricsCollector) {
    this.metrics = metrics;
  }

  addStage(stage: FilterStage): void {
    this.stages.push(stage);
    this.stages.sort((a, b) => a.priority - b.priority);
  }

  async executePipeline(content: string): Promise<FilterResult> {
    const startTime = performance.now();
    let result: FilterResult = { isAllowed: true, reasons: [] };

    for (const stage of this.stages) {
      try {
        const stageResult = await Promise.race([
          stage.execute(content),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Stage timeout')), 
            stage.timeoutMs || 5000)
          )
        ]);

        if (!stageResult.isAllowed) {
          result = stageResult;
          break;
        }
      } catch (error) {
        await this.metrics.trackLatency('filter_stage_error', 
          performance.now() - startTime);
        throw error;
      }
    }

    await this.metrics.trackLatency('filter_pipeline_complete', 
      performance.now() - startTime);
    return result;
  }
}