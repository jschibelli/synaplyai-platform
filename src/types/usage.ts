/**
 * Current token usage information for a tenant
 */
export interface TokenUsage {
  used: number;
  limit: number;
  resetDate: string;
  plan: string;
  modelBreakdown: {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
  }[];
}

/**
 * Historical token usage data point
 */
export interface TokenUsageHistory {
  timestamp: string;
  totalTokens: number;
  modelId: string;
}

/**
 * Processed token usage data ready for visualization
 */
export interface ProcessedTokenUsage {
  total: number;
  available: number;
  percentUsed: number;
  plan?: string;
  resetDate?: Date;
  byModel: {
    modelId: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  }[];
}