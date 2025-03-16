import { PricingService } from '../../src/services/PricingService';

describe('Cost Calculation', () => {
  const pricingService = new PricingService();

  it('should calculate correct costs per model', () => {
    const costs = {
      'gpt-4': pricingService.calculateCost(1000, 500, 'gpt-4', 'basic'),
      'claude-3': pricingService.calculateCost(1000, 500, 'claude-3', 'basic')
    };

    expect(costs['gpt-4']).toBeGreaterThan(0);
    expect(costs['claude-3']).toBeGreaterThan(0);
  });

  it('should apply tier discounts', () => {
    const basicCost = pricingService.calculateCost(1000, 500, 'gpt-4', 'basic');
    const proCost = pricingService.calculateCost(1000, 500, 'gpt-4', 'pro');

    expect(proCost).toBeLessThan(basicCost);
  });
});