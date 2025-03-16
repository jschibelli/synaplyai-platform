import { ContentFilter, FilterResponse, ContentFilterResult } from './interfaces';
import { ComplianceLogger } from '../compliance/logger';

interface RegexRule {
  pattern: RegExp;
  result: ContentFilterResult;
  reason: string;
  confidence: number;
}

export class RegexContentFilter implements ContentFilter {
  name = 'RegexContentFilter';
  description = 'Filter content using regular expression patterns';
  
  private rules: RegexRule[] = [];
  
  constructor(rules?: { pattern: string | RegExp; result: ContentFilterResult; reason: string, confidence: number }[]) {
    if (rules) {
      rules.forEach(rule => {
        this.addRule(
          rule.pattern instanceof RegExp ? rule.pattern : new RegExp(rule.pattern, 'i'),
          rule.result,
          rule.reason,
          rule.confidence
        );
      });
    }
  }
  
  addRule(pattern: RegExp, result: ContentFilterResult, reason: string, confidence: number = 1.0): void {
    this.rules.push({ pattern, result, reason, confidence });
  }
  
  async filter(content: string, context?: Record<string, any>): Promise<FilterResponse> {
    // Default response if nothing matches
    let response: FilterResponse = {
      result: ContentFilterResult.ALLOWED,
      confidence: 1.0
    };
    
    // Check each rule
    for (const rule of this.rules) {
      if (rule.pattern.test(content)) {
        response = {
          result: rule.result,
          confidence: rule.confidence,
          reason: rule.reason
        };
        
        // Log the filter result if it's not ALLOWED
        if (rule.result !== ContentFilterResult.ALLOWED) {
          await ComplianceLogger.log({
            eventType: 'content.filtered',
            description: `Content filtered by ${this.name}`,
            metadata: {
              filterName: this.name,
              result: rule.result,
              reason: rule.reason,
              pattern: rule.pattern.toString()
            }
          });
        }
        
        // If we've blocked the content, return immediately
        if (rule.result === ContentFilterResult.BLOCKED) {
          return response;
        }
      }
    }
    
    return response;
  }
}