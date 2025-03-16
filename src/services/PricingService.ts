export class PricingService {
  private modelRates: Record<string, number> = {
    'gpt-4': 0.03,
    'claude-3': 0.015
  };

  private tierDiscounts: Record<string, number> = {
    'basic': 1.0,
    'pro': 0.8
  };

  getRate(modelId: string, tier: string): number {
    const baseRate = this.modelRates[modelId] || 0.03;
    const discount = this.tierDiscounts[tier] || 1.0;
    return baseRate * discount;
  }

  calculateCost(
    requestTokens: number, 
    responseTokens: number, 
    modelId: string, 
    tier: string
  ): number {
    const rate = this.getRate(modelId, tier);
    return (requestTokens + responseTokens) * rate / 1000;
  }
}