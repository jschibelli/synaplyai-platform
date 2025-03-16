import { ContentFilter, FilterResponse, ContentFilterResult } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';
import { getFeatureFlag } from '../features/flag-service';
import { getLLMCompletion } from '../services/ai';

export class LLMContentFilter implements ContentFilter {
  name = 'LLMContentFilter';
  description = 'Filter content using LLM-based analysis';
  
  private tenantId: string;
  private timeout: number;
  private categories: string[];
  
  constructor(tenantId: string, categories: string[] = [], timeout: number = 5000) {
    this.tenantId = tenantId;
    this.categories = categories.length > 0 ? categories : [
      'hate_speech', 'sexual_content', 'violence', 'self_harm', 
      'harassment', 'private_information', 'spam'
    ];
    this.timeout = timeout;
  }
  
  async filter(content: string, context?: Record<string, any>): Promise<FilterResponse> {
    // Check feature flag first
    const isEnabled = await getFeatureFlag('llm-filter-enabled', this.tenantId, true);
    
    if (!isEnabled) {
      return {
        result: ContentFilterResult.ALLOWED,
        confidence: 1.0,
        reason: 'LLM filter disabled by feature flag'
      };
    }
    
    try {
      // Create a promise that resolves with the LLM response
      const llmPromise = this.getLLMFilterResult(content);
      
      // Create a promise that rejects after timeout
      const timeoutPromise = new Promise<FilterResponse>((_, reject) => {
        setTimeout(() => reject(new Error('LLM filter timed out')), this.timeout);
      });
      
      // Race between the LLM response and the timeout
      const response = await Promise.race([llmPromise, timeoutPromise]);
      
      // Log the filter result if it's not ALLOWED
      if (response.result !== ContentFilterResult.ALLOWED) {
        await ComplianceLogger.log({
          eventType: 'content.filtered',
          description: `Content filtered by ${this.name}`,
          metadata: {
            filterName: this.name,
            result: response.result,
            reason: response.reason,
            confidence: response.confidence
          }
        });
      }
      
      return response;
    } catch (error) {
      // Log the error
      await ComplianceLogger.log({
        eventType: 'content.filter.error',
        description: `Error in ${this.name}`,
        metadata: { error: error.message }
      });
      
      // Return allowed on error (fail open for user experience, other filters will still apply)
      return {
        result: ContentFilterResult.ALLOWED,
        confidence: 0.5,
        reason: `LLM filter error: ${error.message}`
      };
    }
  }
  
  private async getLLMFilterResult(content: string): Promise<FilterResponse> {
    const prompt = `
      Analyze the following content for policy violations. Evaluate ONLY for these categories: 
      ${this.categories.join(', ')}.
      
      Return a JSON object with the following fields:
      - result: either "ALLOWED", "FLAGGED", or "BLOCKED"
      - confidence: a number between 0 and 1 indicating confidence level
      - reason: a brief explanation of the decision if not ALLOWED
      
      Content to analyze:
      "${content}"
      
      JSON response:
    `;
    
    const result = await getLLMCompletion(prompt);
    
    try {
      const parsed = JSON.parse(result);
      
      // Validate the response format
      if (
        !parsed.result ||
        !['ALLOWED', 'FLAGGED', 'BLOCKED'].includes(parsed.result) ||
        typeof parsed.confidence !== 'number' ||
        parsed.confidence < 0 || 
        parsed.confidence > 1
      ) {
        throw new Error('Invalid LLM response format');
      }
      
      return {
        result: parsed.result as ContentFilterResult,
        confidence: parsed.confidence,
        reason: parsed.reason || undefined
      };
    } catch (error) {
      // Return allowed on parsing error
      return {
        result: ContentFilterResult.ALLOWED,
        confidence: 0.5,
        reason: 'Failed to parse LLM response'
      };
    }
  }
}