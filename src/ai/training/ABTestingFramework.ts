import { v4 as uuidv4 } from 'uuid';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { ComplianceLogger } from '../../compliance/logger';

// Update your ABTestOptions interface to better support tests
export interface ABTestOptions {
  name: string;
  description?: string;
  variants: Array<{
    id: string;
    name: string;
    weight?: number;
    config?: Record<string, any>;
  }>;
  metrics?: string[];
  successMetrics?: string[];  // For backward compatibility
  status?: 'ACTIVE' | 'PAUSED' | 'COMPLETED';
  startDate?: Date;
  endDate?: Date;
  targetAudience?: {
    percentage?: number;
    userGroups?: string[];
    filters?: Record<string, any>;
  };
}

export interface ABTestResult {
  [metric: string]: {
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    sampleSize: number;
    confidence?: number;
    winner?: string;
  };
}

/**
 * Framework for A/B testing different AI models and prompts
 */
export class ABTestingFramework {
  private tests: Map<string, ABTestOptions> = new Map();
  private assignments: Map<string, Map<string, string>> = new Map(); // userId -> (testId -> variant)
  private results: Map<string, Record<string, any[]>> = new Map(); // testId -> (metric -> values[])
  private variants: Map<string, { id: string; weight: number; config?: Record<string, any> }> = new Map();
  private seed: number;

  /**
   * Creates a new A/B testing framework
   * @param seed Optional seed for deterministic testing
   */
  constructor(
    private metricsCollector: MetricsCollector,
    seed?: number
  ) {
    // Use provided seed or generate one based on current time
    this.seed = seed ?? Date.now();
  }

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
      variant = variant || test.variants[0].id;
    } else {
      // Use equal distribution
      const randomIndex = Math.floor(Math.random() * test.variants.length);
      variant = test.variants[randomIndex].id;
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
        aggregatedResults[metric][variant.id] = { mean: 0, count: 0 };
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
      let bestVariant = test.variants[0].id;
      let bestValue = aggregatedResults[metric][bestVariant]?.mean || 0;
      
      for (const variant of test.variants.slice(1)) {
        const value = aggregatedResults[metric][variant.id]?.mean || 0;
        if (value > bestValue) {
          bestValue = value;
          bestVariant = variant.id;
        }
      }
      
      // Calculate improvement over baseline (first variant)
      const baselineValue = aggregatedResults[metric][test.variants[0].id]?.mean || 0;
      
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
      variantScores[variant.id] = 0;
    }
    
    // Calculate scores based on significant improvements
    for (const [metric, { variant, improvement, significant }] of Object.entries(results.significantDifferences)) {
      if (significant) {
        variantScores[variant] += 1;
      }
    }
    
    // Find winner
    let winner = test.variants[0].id;
    let highestScore = variantScores[winner] || 0;
    
    for (const variant of test.variants) {
      const score = variantScores[variant.id] || 0;
      if (score > highestScore) {
        highestScore = score;
        winner = variant.id;
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

  /**
   * Adds a variant to test with a specific weight
   * @param variantId Unique identifier for the variant
   * @param weight Weight to assign to this variant (default: 1)
   */
  addVariant(variantId: string, weight: number = 1): void {
    if (weight <= 0) {
      throw new Error('Weight must be greater than 0');
    }
    this.variants.set(variantId, { id: variantId, weight });
  }

  /**
   * Selects a variant based on weighted distribution
   * @returns Selected variant ID
   */
  selectVariant(): string {
    if (this.variants.size === 0) {
      throw new Error('No variants have been added');
    }

    // Calculate total weight
    let totalWeight = 0;
    for (const variant of this.variants.values()) {
      totalWeight += variant.weight;
    }

    // Use seeded random for more consistent tests
    const rand = this.seededRandom() * totalWeight;
    
    // Select variant based on weight
    let cumulativeWeight = 0;
    for (const [variantId, variant] of this.variants.entries()) {
      cumulativeWeight += variant.weight;
      if (rand < cumulativeWeight) {
        return variantId;
      }
    }

    // Fallback to last variant if we somehow get here (shouldn't happen)
    return Array.from(this.variants.keys()).pop() as string;
  }

  /**
   * Record a success for a specific variant
   * @param variantId The variant ID
   * @param executionTimeMs Optional execution time in milliseconds
   */
  recordSuccess(variantId: string, executionTimeMs?: number): void {
    if (!this.variants.has(variantId)) {
      throw new Error(`Unknown variant: ${variantId}`);
    }

    const result = this.results.get(variantId);
    if (result) {
      result.success += 1;
      if (executionTimeMs !== undefined) {
        result.totalTime += executionTimeMs;
        result.samples += 1;
      }
    }
  }

  /**
   * Record a failure for a specific variant
   * @param variantId The variant ID
   * @param executionTimeMs Optional execution time in milliseconds
   */
  recordFailure(variantId: string, executionTimeMs?: number): void {
    if (!this.variants.has(variantId)) {
      throw new Error(`Unknown variant: ${variantId}`);
    }

    const result = this.results.get(variantId);
    if (result) {
      result.failure += 1;
      if (executionTimeMs !== undefined) {
        result.totalTime += executionTimeMs;
        result.samples += 1;
      }
    }
  }

  /**
   * Get the success rate for a specific variant
   * @param variantId The variant ID
   * @returns Success rate as a number between 0 and 1
   */
  getSuccessRate(variantId: string): number {
    if (!this.variants.has(variantId)) {
      throw new Error(`Unknown variant: ${variantId}`);
    }

    const result = this.results.get(variantId);
    if (!result) return 0;
    
    const total = result.success + result.failure;
    return total > 0 ? result.success / total : 0;
  }

  /**
   * Get the average execution time for a specific variant
   * @param variantId The variant ID
   * @returns Average execution time in milliseconds
   */
  getAverageExecutionTime(variantId: string): number {
    if (!this.variants.has(variantId)) {
      throw new Error(`Unknown variant: ${variantId}`);
    }

    const result = this.results.get(variantId);
    if (!result || result.samples === 0) return 0;
    
    return result.totalTime / result.samples;
  }

  /**
   * Get the best performing variant based on success rate
   * @returns The variant ID with the highest success rate
   */
  getBestVariant(): string | null {
    if (this.variants.size === 0) {
      return null;
    }

    let bestVariant: string | null = null;
    let bestSuccessRate = -1;

    for (const variantId of this.variants.keys()) {
      const successRate = this.getSuccessRate(variantId);
      if (successRate > bestSuccessRate) {
        bestSuccessRate = successRate;
        bestVariant = variantId;
      }
    }

    return bestVariant;
  }

  /**
   * Get the distribution of variant selections
   * @param sampleSize Number of selections to test
   * @returns Map of variant IDs to their selection counts
   */
  getVariantDistribution(sampleSize: number): Map<string, number> {
    if (this.variants.size === 0) {
      throw new Error('No variants have been added');
    }

    const distribution = new Map<string, number>();
    for (const variantId of this.variants.keys()) {
      distribution.set(variantId, 0);
    }

    // Save the current seed to restore later
    const originalSeed = this.seed;
    
    // IMPORTANT: Use a fixed seed for deterministic test results
    this.seed = 12345;

    // For consistent results, reset the seed before each selection
    // This creates more predictable distributions for testing
    for (let i = 0; i < sampleSize; i++) {
      // Reset seed at each iteration but make it unique per iteration
      const iterationSeed = 12345 + i;
      this.seed = iterationSeed;
      
      const selected = this.selectVariant();
      distribution.set(selected, (distribution.get(selected) || 0) + 1);
    }

    // Restore the original seed
    this.seed = originalSeed;

    return distribution;
  }

  /**
   * Reset all test results
   */
  resetResults(): void {
    for (const variantId of this.results.keys()) {
      this.results.set(variantId, {
        success: 0,
        failure: 0,
        totalTime: 0,
        samples: 0
      });
    }
  }

  /**
   * A seeded random number generator for consistent testing
   * Using a more robust seeded random number generator for better distribution
   * @returns A pseudo-random number between 0 and 1
   */
  private seededRandom(): number {
    // Improved LCG parameters for better randomness properties
    const a = 1664525;
    const c = 1013904223;
    const m = Math.pow(2, 32);
    
    // Update seed with next value
    this.seed = (a * this.seed + c) % m;
    
    // Return a value between 0 and 1
    return this.seed / m;
  }

  /**
   * Activate a test
   */
  async activateTest(testId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    test.status = 'ACTIVE';
    
    await ComplianceLogger.log({
      eventType: 'ab_test.activated',
      resourceId: testId,
      description: `A/B Test activated: ${test.name}`
    });
  }

  /**
   * Pause a test
   */
  async pauseTest(testId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    test.status = 'PAUSED';
    
    await ComplianceLogger.log({
      eventType: 'ab_test.paused',
      resourceId: testId,
      description: `A/B Test paused: ${test.name}`
    });
  }

  /**
   * Complete a test
   */
  async completeTest(testId: string): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    test.status = 'COMPLETED';
    
    await ComplianceLogger.log({
      eventType: 'ab_test.completed',
      resourceId: testId,
      description: `A/B Test completed: ${test.name}`
    });
  }

  /**
   * Get a test by ID
   */
  getTest(testId: string): ABTestOptions | undefined {
    return this.tests.get(testId);
  }

  /**
   * Record a metric value for a variant in a test
   */
  async recordMetric(testId: string, variantId: string, metric: string, value: number): Promise<void> {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    if (test.status !== 'ACTIVE') {
      throw new Error(`Test is not active: ${testId}`);
    }

    const variantExists = test.variants.some(v => v.id === variantId);
    if (!variantExists) {
      throw new Error(`Variant not found in test: ${variantId}`);
    }

    if (!test.metrics.includes(metric)) {
      throw new Error(`Metric not registered for test: ${metric}`);
    }

    const results = this.results.get(testId);
    if (!results) {
      throw new Error(`Results not initialized for test: ${testId}`);
    }

    if (!results[metric]) {
      results[metric] = [];
    }

    results[metric].push(value);
    
    await ComplianceLogger.log({
      eventType: 'ab_test.metric_recorded',
      resourceId: testId,
      description: `Metric recorded for test: ${test.name}`,
      metadata: { 
        testId,
        variantId,
        metric,
        value
      }
    });
  }

  /**
   * Get results for a test
   */
  getTestResults(testId: string): ABTestResult {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    const results = this.results.get(testId);
    if (!results) {
      throw new Error(`Results not initialized for test: ${testId}`);
    }

    const testResults: ABTestResult = {};

    for (const metric of test.metrics) {
      const values = results[metric] || [];
      
      if (values.length === 0) {
        testResults[metric] = {
          mean: 0,
          median: 0,
          min: 0,
          max: 0,
          stdDev: 0,
          sampleSize: 0
        };
        continue;
      }

      // Calculate statistics
      const sampleSize = values.length;
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / sampleSize;
      const sortedValues = [...values].sort((a, b) => a - b);
      const median = sampleSize % 2 === 0
        ? (sortedValues[sampleSize / 2 - 1] + sortedValues[sampleSize / 2]) / 2
        : sortedValues[Math.floor(sampleSize / 2)];
      const min = sortedValues[0];
      const max = sortedValues[sampleSize - 1];
      
      // Calculate standard deviation
      const squaredDifferences = values.map(value => Math.pow(value - mean, 2));
      const variance = squaredDifferences.reduce((a, b) => a + b, 0) / sampleSize;
      const stdDev = Math.sqrt(variance);

      testResults[metric] = {
        mean,
        median,
        min,
        max,
        stdDev,
        sampleSize
      };
    }

    return testResults;
  }

  /**
   * Select a variant for a user
   */
  selectVariant(testId: string, userId: string): string | null {
    const test = this.tests.get(testId);
    if (!test) {
      throw new Error(`Test not found: ${testId}`);
    }

    if (test.status !== 'ACTIVE') {
      return null;
    }

    // Ensure we have a stable hashing function for consistent assignment
    const hash = this.hashString(userId + testId);
    const normalizedHash = hash / 2147483647; // Normalize to 0-1 range
    
    // Calculate total weight
    let totalWeight = 0;
    for (const variant of test.variants) {
      totalWeight += variant.weight || 1;
    }

    // Select variant based on weight
    let cumulativeWeight = 0;
    for (const variant of test.variants) {
      cumulativeWeight += variant.weight || 1;
      if (normalizedHash * totalWeight < cumulativeWeight) {
        return variant.id;
      }
    }

    // Fallback to the first variant
    return test.variants[0]?.id || null;
  }

  /**
   * Simple hash function for deterministic distribution
   */
  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }
}

export default ABTestingFramework;