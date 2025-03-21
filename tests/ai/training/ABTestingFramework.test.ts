import { ABTestingFramework } from '../../../src/ai/training/ABTestingFramework';

describe('ABTestingFramework', () => {
  let abTesting: ABTestingFramework;
  
  beforeEach(() => {
    abTesting = new ABTestingFramework();
  });
  
  test('creates test with model variants', async () => {
    const testId = await abTesting.createTest({
      name: 'Grammar correction model comparison',
      description: 'Test different fine-tuned models for grammar correction',
      tenantId: 'tenant-123',
      variants: [
        { modelId: 'model-baseline', name: 'Baseline', weight: 0.5 },
        { modelId: 'model-fine-tuned', name: 'Fine-tuned', weight: 0.5 }
      ],
      successMetrics: ['ACCEPTANCE_RATE', 'EDIT_DISTANCE', 'RESPONSE_TIME'],
      targetUsers: 'ALL'
    });
    
    expect(testId).toBeDefined();
    
    const test = await abTesting.getTest(testId);
    expect(test.name).toBe('Grammar correction model comparison');
    expect(test.variants).toHaveLength(2);
    expect(test.status).toBe('ACTIVE');
  });
  
  test('assigns users to variants based on weights', async () => {
    const testId = await abTesting.createTest({
      name: 'Variant weight test',
      tenantId: 'tenant-123',
      variants: [
        { modelId: 'model-a', name: 'Model A', weight: 0.25 },
        { modelId: 'model-b', name: 'Model B', weight: 0.75 }
      ],
      successMetrics: ['ACCEPTANCE_RATE'],
      targetUsers: 'ALL'
    });
    
    // Mock 1000 assignments and check distribution
    const assignments: Record<string, number> = { 'model-a': 0, 'model-b': 0 };
    
    for (let i = 0; i < 1000; i++) {
      const userId = `user-${i}`;
      const modelId = await abTesting.getAssignedVariant(testId, userId);
      assignments[modelId]++;
    }
    
    // Check that assignments are roughly proportional to weights
    // Allow for some randomness with a tolerance of 5%
    expect(assignments['model-a']).toBeGreaterThan(1000 * 0.25 * 0.95);
    expect(assignments['model-a']).toBeLessThan(1000 * 0.25 * 1.05);
    expect(assignments['model-b']).toBeGreaterThan(1000 * 0.75 * 0.95);
    expect(assignments['model-b']).toBeLessThan(1000 * 0.75 * 1.05);
  });
  
  test('records and analyzes metrics', async () => {
    const testId = await abTesting.createTest({
      name: 'Metrics test',
      tenantId: 'tenant-123',
      variants: [
        { modelId: 'model-x', name: 'Model X', weight: 0.5 },
        { modelId: 'model-y', name: 'Model Y', weight: 0.5 }
      ],
      successMetrics: ['ACCEPTANCE_RATE', 'RESPONSE_TIME'],
      targetUsers: 'ALL'
    });
    
    // Record metrics for model X
    await abTesting.recordMetric({
      testId,
      userId: 'user-1',
      variantId: 'model-x',
      metric: 'ACCEPTANCE_RATE',
      value: 1 // accepted
    });
    
    await abTesting.recordMetric({
      testId,
      userId: 'user-1',
      variantId: 'model-x',
      metric: 'RESPONSE_TIME',
      value: 450 // ms
    });
    
    // Record metrics for model Y
    await abTesting.recordMetric({
      testId,
      userId: 'user-2',
      variantId: 'model-y',
      metric: 'ACCEPTANCE_RATE',
      value: 0 // rejected
    });
    
    await abTesting.recordMetric({
      testId,
      userId: 'user-2',
      variantId: 'model-y',
      metric: 'RESPONSE_TIME',
      value: 350 // ms
    });
    
    // Get test results
    const results = await abTesting.getTestResults(testId);
    
    // Check metrics calculations
    expect(results.metrics.ACCEPTANCE_RATE).toEqual({
      'model-x': { mean: 1.0, count: 1 },
      'model-y': { mean: 0.0, count: 1 }
    });
    
    expect(results.metrics.RESPONSE_TIME).toEqual({
      'model-x': { mean: 450, count: 1 },
      'model-y': { mean: 350, count: 1 }
    });
    
    // Check statistical significance
    expect(results.significantDifferences).toBeDefined();
  });
  
  test('concludes test and declares winner', async () => {
    const testId = await abTesting.createTest({
      name: 'Winner test',
      tenantId: 'tenant-123',
      variants: [
        { modelId: 'model-poor', name: 'Poor Model', weight: 0.5 },
        { modelId: 'model-good', name: 'Good Model', weight: 0.5 }
      ],
      successMetrics: ['ACCEPTANCE_RATE'],
      targetUsers: 'ALL',
      minimumSampleSize: 10
    });
    
    // Record enough metrics to reach minimum sample size
    for (let i = 0; i < 10; i++) {
      await abTesting.recordMetric({
        testId,
        userId: `user-${i}-poor`,
        variantId: 'model-poor',
        metric: 'ACCEPTANCE_RATE',
        value: 0.3 // 30% acceptance rate
      });
      
      await abTesting.recordMetric({
        testId,
        userId: `user-${i}-good`,
        variantId: 'model-good',
        metric: 'ACCEPTANCE_RATE',
        value: 0.8 // 80% acceptance rate
      });
    }
    
    // Conclude the test
    const conclusion = await abTesting.concludeTest(testId);
    
    expect(conclusion.status).toBe('CONCLUDED');
    expect(conclusion.winner).toBe('model-good');
    expect(conclusion.winningMetrics.ACCEPTANCE_RATE.improvement).toBeCloseTo(0.5);
    expect(conclusion.winningMetrics.ACCEPTANCE_RATE.significant).toBe(true);
  });
});