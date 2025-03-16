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