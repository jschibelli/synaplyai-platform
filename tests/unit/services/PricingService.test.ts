class PricingService {
  getRate(modelId: string, tier: string): number {
    // Example rates, this should be replaced with actual logic
    const rates = {
      'basic': 0.01,
      'premium': 0.005,
    };
    return rates[tier] || 0;
  }

  calculateCost(requestTokens: number, responseTokens: number, modelId: string, tier: string): number {
    const requestRate = this.getRate(modelId, tier);
    const responseRate = this.getRate(modelId, tier);
    
    return (requestTokens * requestRate) + (responseTokens * responseRate);
  }
}

describe('PricingService', () => {
  let pricingService: PricingService;

  beforeEach(() => {
    pricingService = new PricingService();
  });

  it('should return correct rate for basic tier', () => {
    const rate = pricingService.getRate('model1', 'basic');
    expect(rate).toBe(0.01);
  });

  it('should return correct rate for premium tier', () => {
    const rate = pricingService.getRate('model1', 'premium');
    expect(rate).toBe(0.005);
  });

  it('should calculate cost correctly for basic tier', () => {
    const cost = pricingService.calculateCost(100, 50, 'model1', 'basic');
    expect(cost).toBe(1.5); // (100 * 0.01) + (50 * 0.01)
  });

  it('should calculate cost correctly for premium tier', () => {
    const cost = pricingService.calculateCost(100, 50, 'model1', 'premium');
    expect(cost).toBe(0.75); // (100 * 0.005) + (50 * 0.005)
  });
});