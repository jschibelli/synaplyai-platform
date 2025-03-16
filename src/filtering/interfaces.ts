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

export enum ContentFilterResult {
  ALLOWED = 'ALLOWED',
  FLAGGED = 'FLAGGED',
  BLOCKED = 'BLOCKED'
}

export interface FilterResponse {
  result: ContentFilterResult;
  confidence: number;
  reason?: string;
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