export enum FilterDecision {
  ALLOW = 'ALLOW',
  DENY = 'DENY',
  UNKNOWN = 'UNKNOWN'
}

export interface FilterResult {
  isAllowed: boolean;
  confidenceScore?: number;
  reasons: string[];
}

export interface ContentFilter {
  evaluate(content: string): Promise<FilterResult>;
}

export enum ContentFilterResult {
  ALLOWED = 'ALLOWED',
  BLOCKED = 'BLOCKED',
  WARNING = 'WARNING'
}

export interface FilterResponse {
  result: ContentFilterResult;
  confidence: number;
  reasons?: string[];
}

export interface FilterStage {
  name: string;
  executionStrategy: 'sync' | 'parallel';
  filter: (content: string, context?: any) => Promise<{
    result: ContentFilterResult;
    confidence: number;
  }>;
}

export interface ContentFilter {
  name: string;
  description: string;
  filter(content: string, context?: Record<string, any>): Promise<FilterResponse>;
}

export interface ContentFilterPipeline {
  addFilter(filter: ContentFilter): ContentFilterPipeline;
  process(content: string, context?: Record<string, any>): Promise<FilterResponse>;
  getActiveFilters(): ContentFilter[];
}