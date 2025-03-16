import { ContentFilter, FilterResult, FilterDecision } from './interfaces';

export class RegexFilter implements ContentFilter {
  constructor(private patterns: Map<string, RegExp>) {}

  async evaluate(content: string): Promise<FilterResult> {
    for (const [patternName, pattern] of this.patterns.entries()) {
      if (pattern.test(content)) {
        return {
          decision: FilterDecision.DENY,
          confidence: 1.0,
          source: `regex:${patternName}`
        };
      }
    }
    return {
      decision: FilterDecision.UNKNOWN,
      confidence: 0,
      source: 'regex'
    };
  }
}