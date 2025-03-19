import { TokenUsage, TokenUsageHistory } from '../../types/usage';

/**
 * Transforms raw token usage data into a format suitable for visualizations
 */
export function transformTokenUsageData(tokenUsage: TokenUsage | null) {
  if (!tokenUsage) return { total: 0, available: 0, byModel: [] };
  
  // Calculate total tokens used and available
  const total = tokenUsage.used;
  const available = tokenUsage.limit - tokenUsage.used;
  
  // Transform model breakdown for chart display
  const byModel = tokenUsage.modelBreakdown.map(model => ({
    modelId: model.modelId,
    promptTokens: model.promptTokens,
    completionTokens: model.completionTokens,
    totalTokens: model.promptTokens + model.completionTokens
  }));
  
  return {
    total,
    available,
    percentUsed: Math.round((total / tokenUsage.limit) * 100),
    plan: tokenUsage.plan,
    resetDate: new Date(tokenUsage.resetDate),
    byModel
  };
}

/**
 * Groups historical usage data by day or hour depending on date range
 */
export function groupHistoricalUsageData(
  history: TokenUsageHistory[], 
  startDate: Date, 
  endDate: Date
) {
  if (!history.length) return [];

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  const groupByHour = diffDays <= 2; // Group by hour if range is 2 days or less
  
  // Map to standardize timestamps to either day or hour granularity
  return history.map(item => {
    const date = new Date(item.timestamp);
    let formattedDate: string;
    
    if (groupByHour) {
      formattedDate = `${date.toLocaleDateString()} ${date.getHours()}:00`;
    } else {
      formattedDate = date.toLocaleDateString();
    }
    
    return {
      timestamp: formattedDate,
      totalTokens: item.totalTokens,
      modelId: item.modelId
    };
  });
}