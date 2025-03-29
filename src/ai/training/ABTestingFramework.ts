import { v4 as uuidv4 } from 'uuid';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { ComplianceLogger } from '../../compliance/logger';

// Update your ABTestOptions interface to better support tests
export interface ABTestOptions {
  name: string;
  description?: string;
  variants: string[];
  distribution?: Record<string, number>; // weighted distribution
  targetUserGroups?: string[];
  metrics?: string[]; // Make metrics optional since we'll fallback to successMetrics
  startDate?: Date;
  endDate?: Date;
  metadata?: Record<string, any>;
  // Fields for compatibility with tests
  tenantId?: string;
  successMetrics?: string[];
  targetUsers?: string;
  minimumSampleSize?: number;
  status?: 'ACTIVE' | 'PAUSED' | 'CONCLUDED';
}

export interface ABTestResult {
  testId: string;
  metrics: Record<string, Record<string, { mean: number; count: number }>>;
  significantDifferences: Record<string, { variant: string; improvement: number; significant: boolean }>;
}

/**
 * Framework for conducting A/B tests on AI models and features
 */
export class ABTestingFramework {
  private tests: Map<string, ABTestOptions> = new Map();
  private assignments: Map<string, Map<string, string>> = new Map(); // userId -> (testId -> variant)
  private results: Map<string, Record<string, any[]>> = new Map(); // testId -> (metric -> values[])
  
  constructor(
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Create a new A/B test
   */
  async createTest(options: ABTestOptions): Promise<string> {
    const testId = `test-${uuidv4()}`;
    
    // Create a normalized copy with fallbacks for test compatibility
    const normalizedOptions = {
      ...options,
      metrics: options.metrics || options.successMetrics || [],
      status: options.status || 'ACTIVE' // Add default status for test compatibility
    };
    
    this.tests.set(testId, normalizedOptions);
    this.results.set(testId, {});
    
    // Initialize metrics
    for (const metric of normalizedOptions.metrics) {
      this.results.get(testId)![metric] = [];
    }
    
    // Log creation for compliance
    await ComplianceLogger.log({
      eventType: 'ab_test.created',
      resourceId: testId,
      description: `A/B Test created: ${options.name}`,
      metadata: { 
        testId,
        variants: options.variants,
        metrics: normalizedOptions.metrics // Use normalized metrics
      }
    });
    
    return testId;
  }
  
  /**
   * Get details of an existing test
   */
  async getTest(testId: string): Promise<ABTestOptions | null> {
    return this.tests.get(testId) || null;
  }
  
  /**
   * Assign a user to a variant for a test
   */
  async getAssignedVariant(testId: string, userId: string): Promise<string> {
    // Check if user already has an assignment
    if (!this.assignments.has(userId)) {
      this.assignments.set(userId, new Map());
    }
    
    const userAssignments = this.assignments.get(userId)!;
    
    if (userAssignments.has(testId)) {
      return userAssignments.get(testId)!;
    }
    
    // Get test details
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    // Assign variant
    let variant: string;
    
    if (test.distribution) {
      // Use weighted distribution
      const random = Math.random();
      let cumulativeWeight = 0;
      
      for (const [variantName, weight] of Object.entries(test.distribution)) {
        cumulativeWeight += weight;
        if (random <= cumulativeWeight) {
          variant = variantName;
          break;
        }
      }
      
      // Fallback if distribution doesn't sum to 1
      variant = variant || test.variants[0];
    } else {
      // Use equal distribution
      const randomIndex = Math.floor(Math.random() * test.variants.length);
      variant = test.variants[randomIndex];
    }
    
    // Store assignment
    userAssignments.set(testId, variant);
    
    // Log assignment for compliance
    await ComplianceLogger.log({
      eventType: 'ab_test.assignment',
      resourceId: testId,
      description: `User assigned to variant in A/B test`,
      metadata: { 
        testId,
        userId,
        variant
      }
    });
    
    return variant;
  }
  
  /**
   * Record a metric value for an A/B test
   */
  async recordMetric(options: { 
    testId: string; 
    userId: string; 
    metric: string; 
    value: number;
    variantId?: string; // Add this for test compatibility
    metadata?: Record<string, any>;
  }): Promise<void> {
    const { testId, userId, metric, value, variantId, metadata } = options;
    
    // Use variantId if provided, otherwise get assigned variant
    const variant = variantId || await this.getAssignedVariant(testId, userId);
    
    // Get test details
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    // Ensure metric is valid for this test
    if (!test.metrics.includes(metric)) {
      throw new Error(`Metric ${metric} is not defined for test ${testId}`);
    }
    
    // Store metric result
    if (!this.results.has(testId)) {
      this.results.set(testId, {});
    }
    
    const testResults = this.results.get(testId)!;
    
    if (!testResults[metric]) {
      testResults[metric] = [];
    }
    
    testResults[metric].push({
      userId,
      variant,
      value,
      timestamp: Date.now(),
      metadata
    });
    
    // Track in metrics collector
    this.metricsCollector.recordValue(`ab_test.${testId}.${metric}.${variant}`, value);
  }
  
  /**
   * Get aggregated results for a test
   */
  async getTestResults(testId: string): Promise<ABTestResult> {
    // Get test details
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    // Get test results
    const testResults = this.results.get(testId) || {};
    
    // Aggregate results by variant
    const aggregatedResults: Record<string, Record<string, { mean: number; count: number }>> = {};
    
    for (const metric of test.metrics) {
      aggregatedResults[metric] = {};
      
      // Initialize variants
      for (const variant of test.variants) {
        aggregatedResults[metric][variant] = { mean: 0, count: 0 };
      }
      
      // Aggregate values
      const metricResults = testResults[metric] || [];
      
      for (const result of metricResults) {
        const { variant, value } = result;
        const current = aggregatedResults[metric][variant];
        
        // Update mean using weighted average
        const newCount = current.count + 1;
        const newMean = ((current.mean * current.count) + value) / newCount;
        
        aggregatedResults[metric][variant] = {
          mean: newMean,
          count: newCount
        };
      }
    }
    
    // Calculate significant differences
    const significantDifferences: Record<string, { 
      variant: string; 
      improvement: number; 
      significant: boolean;
    }> = {};
    
    for (const metric of test.metrics) {
      // Find best variant
      let bestVariant = test.variants[0];
      let bestValue = aggregatedResults[metric][bestVariant]?.mean || 0;
      
      for (const variant of test.variants.slice(1)) {
        const value = aggregatedResults[metric][variant]?.mean || 0;
        if (value > bestValue) {
          bestValue = value;
          bestVariant = variant;
        }
      }
      
      // Calculate improvement over baseline (first variant)
      const baselineValue = aggregatedResults[metric][test.variants[0]]?.mean || 0;
      
      if (baselineValue === 0) continue; // Skip if baseline has no data
      
      const improvement = (bestValue - baselineValue) / baselineValue;
      
      // Determine if difference is significant (simplified)
      // In a real implementation, this would use statistical significance tests
      const significant = Math.abs(improvement) > 0.1 && 
                          aggregatedResults[metric][bestVariant].count >= 30;
      
      significantDifferences[metric] = {
        variant: bestVariant,
        improvement,
        significant
      };
    }
    
    return {
      testId,
      metrics: aggregatedResults,
      significantDifferences
    };
  }
  
  /**
   * Conclude a test and determine the winning variant
   */
  async concludeTest(testId: string): Promise<{ 
    status: 'CONCLUDED';
    winner: string; 
    winningMetrics: Record<string, { improvement: number; significant: boolean }>; 
  }> {
    // Get test results
    const results = await this.getTestResults(testId);
    const test = this.tests.get(testId);
    
    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }
    
    // Determine overall winner
    const variantScores: Record<string, number> = {};
    
    // Initialize scores
    for (const variant of test.variants) {
      variantScores[variant] = 0;
    }
    
    // Calculate scores based on significant improvements
    for (const [metric, { variant, improvement, significant }] of Object.entries(results.significantDifferences)) {
      if (significant) {
        variantScores[variant] += 1;
      }
    }
    
    // Find winner
    let winner = test.variants[0];
    let highestScore = variantScores[winner] || 0;
    
    for (const variant of test.variants) {
      const score = variantScores[variant] || 0;
      if (score > highestScore) {
        highestScore = score;
        winner = variant;
      }
    }
    
    // Format winning metrics
    const winningMetrics: Record<string, { improvement: number; significant: boolean }> = {};
    
    for (const [metric, { variant, improvement, significant }] of Object.entries(results.significantDifferences)) {
      if (variant === winner) {
        winningMetrics[metric] = { improvement, significant };
      }
    }
    
    // Log conclusion for compliance
    await ComplianceLogger.log({
      eventType: 'ab_test.concluded',
      resourceId: testId,
      description: `A/B Test concluded: ${test.name}`,
      metadata: { 
        testId,
        winner,
        metrics: Object.keys(winningMetrics)
      }
    });
    
    return {
      status: 'CONCLUDED',
      winner,
      winningMetrics
    };
  }
}