import { performance } from 'perf_hooks';
import { TestEnvironment } from '../utils/TestEnvironment';

// Define types
interface TestResult {
  duration: number;
  operationsPerUser: number;
  operationsPerSecond: number;
  redisMetrics: any;
  aiMetrics: any;
  conflictMetrics: any;
  successRate: number;
  p95Latency: number;
}

interface ValidationResult {
  passed: boolean;
  metrics: {
    [key: string]: {
      actual: number;
      target: number;
      passed: boolean;
    }
  };
}

// Helper functions
function selectRandomAiCommand(): string {
  const commands = [
    'ai.complete',
    'ai.summarize',
    'ai.rephrase',
    'ai.improveGrammar',
    'ai.suggest'
  ];
  return commands[Math.floor(Math.random() * commands.length)];
}

function selectRandomDocument(userIndex: number): string {
  // The error occurs because document IDs should be in format "doc-t-u-d"
  // where t=tenant index, u=user index, d=document index
  
  // Extract tenant and user indices from the userIndex
  // In our simulation, userIndex is just a counter from 0 to concurrentUsers-1
  const tenantIndex = Math.floor(userIndex / 10); // Assuming 10 users per tenant
  const userIndexInTenant = userIndex % 10;
  const documentIndex = Math.floor(Math.random() * 3); // 3 docs per user
  
  // Return document ID in the format that matches TestEnvironment.create()
  return `doc-${tenantIndex}-${userIndexInTenant}-${documentIndex}`;
}

function generateRandomAiPayload(): any {
  // Create random AI payloads based on different command types
  return {
    content: `This is some test content for AI processing ${Math.random().toString(36).substring(7)}`,
    options: {
      temperature: Math.random() * 0.5 + 0.5,
      maxTokens: Math.floor(Math.random() * 500) + 100
    }
  };
}

function selectRandomEditCommand(): string {
  const commands = [
    'document.insert',
    'document.delete',
    'document.replace',
    'document.format'
  ];
  return commands[Math.floor(Math.random() * commands.length)];
}

function generateRandomEditPayload(): any {
  // Generate random edit operations
  const position = Math.floor(Math.random() * 1000);
  
  // Different payload types based on operation
  const operationType = Math.floor(Math.random() * 3);
  
  switch (operationType) {
    case 0: // Insert
      return {
        position,
        text: `inserted text ${Math.random().toString(36).substring(7)}`
      };
    case 1: // Delete
      return {
        position,
        length: Math.floor(Math.random() * 20) + 1
      };
    case 2: // Replace
      return {
        position,
        length: Math.floor(Math.random() * 20) + 1,
        text: `replacement text ${Math.random().toString(36).substring(7)}`
      };
  }
}

/**
 * Run a combined load test with AI and collaborative editing operations
 */
async function runCombinedLoadTest(): Promise<TestResult> {
  const results: TestResult[] = [];
  
  // Configure concurrent user simulation
  const concurrentUsers = 50;
  const operationsPerUser = 100;
  
  // Create test environment
  const testEnv = await TestEnvironment.create({
    tenants: 5,
    usersPerTenant: 10,
    documentsPerUser: 3
  });
  
  console.log(`Running combined load test with ${concurrentUsers} concurrent users...`);
  
  // Run the test
  const startTime = performance.now();
  await Promise.all(Array.from({ length: concurrentUsers }).map(async (_, userIndex) => {
    // Each user performs operations mixing AI commands and collaborative edits
    for (let i = 0; i < operationsPerUser; i++) {
      // Mix of operations: 70% edits, 30% AI
      const isAiOperation = Math.random() < 0.3;
      
      if (isAiOperation) {
        await testEnv.executeAiCommand({
          userId: `user-${userIndex}`,
          commandType: selectRandomAiCommand(),
          documentId: selectRandomDocument(userIndex),
          payload: generateRandomAiPayload()
        });
      } else {
        await testEnv.executeEditCommand({
          userId: `user-${userIndex}`,
          commandType: selectRandomEditCommand(),
          documentId: selectRandomDocument(userIndex),
          payload: generateRandomEditPayload()
        });
      }
    }
  }));
  
  const duration = performance.now() - startTime;
  console.log(`Test completed in ${duration}ms`);
  
  // Collect results
  const redisMetrics = await testEnv.collectRedisMetrics();
  const aiMetrics = await testEnv.collectAiMetrics();
  const conflictMetrics = await testEnv.collectConflictMetrics();
  
  const result = {
    duration,
    operationsPerUser,
    operationsPerSecond: (concurrentUsers * operationsPerUser) / (duration / 1000),
    redisMetrics,
    aiMetrics,
    conflictMetrics,
    successRate: conflictMetrics.successfulResolutions / conflictMetrics.totalConflicts,
    p95Latency: aiMetrics.latencyP95 || 0
  };
  
  results.push(result);
  return result;
}

/**
 * Validate test results against production readiness targets
 * Based on March 20, 2025 standup notes and project requirements
 */
function validateAgainstTargets(results: TestResult[]): ValidationResult {
  // Calculate averages across all test iterations
  const avgSuccessRate = results.reduce((sum, r) => sum + r.successRate, 0) / results.length;
  const avgAILatency = results.reduce((sum, r) => sum + r.aiMetrics.averageLatency, 0) / results.length;
  const avgP95Latency = results.reduce((sum, r) => sum + r.p95Latency, 0) / results.length;
  const avgOperationsPerSecond = results.reduce((sum, r) => sum + r.operationsPerSecond, 0) / results.length;
  
  // Define targets based on project requirements
  // These values match those mentioned in your standup notes
  const targets = {
    successRate: 0.95, // 95% conflict resolution success (standup shows 98%+ achieved)
    aiLatency: 500,    // 500ms AI response time target
    p95Latency: 100,   // 100ms streaming latency target
    opsPerSecond: 1000 // Minimum operations per second
  };
  
  // Check if we meet all targets
  const validationResult: ValidationResult = {
    passed: true,
    metrics: {
      conflictResolutionSuccess: {
        actual: avgSuccessRate,
        target: targets.successRate,
        passed: avgSuccessRate >= targets.successRate
      },
      aiResponseTime: {
        actual: avgAILatency,
        target: targets.aiLatency,
        passed: avgAILatency <= targets.aiLatency
      },
      streamingLatency: {
        actual: avgP95Latency,
        target: targets.p95Latency,
        passed: avgP95Latency <= targets.p95Latency
      },
      operationsPerSecond: {
        actual: avgOperationsPerSecond,
        target: targets.opsPerSecond,
        passed: avgOperationsPerSecond >= targets.opsPerSecond
      }
    }
  };
  
  // Overall pass only if all metrics pass
  validationResult.passed = Object.values(validationResult.metrics)
    .every(metric => metric.passed);
    
  return validationResult;
}

/**
 * Main test execution function that runs multiple iterations and validates results
 */
async function runLoadTests(iterations = 3): Promise<{
  avgDuration: number;
  avgOps: number;
  avgSuccessRate: number;
  iterations: number;
  testResults: TestResult[];
  validationResult: ValidationResult;
}> {
  console.log("Starting combined load tests...");
  
  try {
    // Run multiple test iterations for better averages
    const testResults: TestResult[] = [];
    
    for (let i = 0; i < iterations; i++) {
      console.log(`\nRunning test iteration ${i+1}/${iterations}...`);
      const result = await runCombinedLoadTest();
      testResults.push(result);
    }
    
    // Calculate and display averages
    const avgDuration = testResults.reduce((sum, r) => sum + r.duration, 0) / testResults.length;
    const avgOps = testResults.reduce((sum, r) => sum + r.operationsPerSecond, 0) / testResults.length;
    const avgSuccessRate = testResults.reduce((sum, r) => sum + r.successRate, 0) / testResults.length;
    
    console.log("\n===== LOAD TEST RESULTS =====");
    console.log(`Average duration: ${avgDuration.toFixed(2)}ms`);
    console.log(`Average operations per second: ${avgOps.toFixed(2)}`);
    console.log(`Average conflict resolution success rate: ${(avgSuccessRate * 100).toFixed(2)}%`);
    
    // Validate against targets
    const validationResult = validateAgainstTargets(testResults);
    
    console.log("\n===== VALIDATION RESULTS =====");
    console.log(`Overall validation: ${validationResult.passed ? '✅ PASSED' : '❌ FAILED'}`);
    
    Object.entries(validationResult.metrics).forEach(([metric, result]) => {
      const status = result.passed ? '✅ PASSED' : '❌ FAILED';
      const actual = metric.includes('Latency') 
        ? `${result.actual.toFixed(2)}ms` 
        : metric.includes('Success') 
          ? `${(result.actual * 100).toFixed(2)}%` 
          : result.actual.toFixed(2);
      const target = metric.includes('Latency') 
        ? `${result.target}ms` 
        : metric.includes('Success') 
          ? `${(result.target * 100).toFixed(2)}%` 
          : result.target;
      
      console.log(`${metric}: ${status} (${actual} vs target ${target})`);
    });
    
    return {
      avgDuration,
      avgOps,
      avgSuccessRate,
      iterations,
      testResults,
      validationResult
    };
  } catch (error) {
    console.error("Error running load tests:", error);
    throw error;
  }
}

/**
 * Generate a markdown report of load test results
 */
function generateMarkdownReport(results: {
  avgDuration: number;
  avgOps: number;
  avgSuccessRate: number;
  iterations: number;
  testResults: TestResult[];
  validationResult: ValidationResult;
}): string {
  const { avgDuration, avgOps, avgSuccessRate, iterations, testResults, validationResult } = results;
  
  const report = [
    '# Load Test Results',
    '',
    `Date: ${new Date().toISOString()}`,
    `Iterations: ${iterations}`,
    '',
    '## Summary',
    '',
    `- Average Duration: ${avgDuration.toFixed(2)}ms`,
    `- Average Operations/Second: ${avgOps.toFixed(2)}`,
    `- Average Conflict Resolution Success: ${(avgSuccessRate * 100).toFixed(2)}%`,
    `- Overall Validation: ${validationResult.passed ? '✅ PASSED' : '❌ FAILED'}`,
    '',
    '## Validation Results',
    '',
    '| Metric | Result | Actual | Target |',
    '| ------ | ------ | ------ | ------ |',
  ];
  
  Object.entries(validationResult.metrics).forEach(([metric, result]) => {
    const status = result.passed ? '✅ PASSED' : '❌ FAILED';
    const actual = metric.includes('Latency') 
      ? `${result.actual.toFixed(2)}ms` 
      : metric.includes('Success') 
        ? `${(result.actual * 100).toFixed(2)}%` 
        : result.actual.toFixed(2);
    const target = metric.includes('Latency') 
      ? `${result.target}ms` 
      : metric.includes('Success') 
        ? `${(result.target * 100).toFixed(2)}%` 
        : result.target;
    
    report.push(`| ${metric} | ${status} | ${actual} | ${target} |`);
  });
  
  report.push('');
  report.push('## Detailed Results');
  report.push('');
  
  testResults.forEach((result, i) => {
    report.push(`### Iteration ${i+1}`);
    report.push('');
    report.push(`- Duration: ${result.duration.toFixed(2)}ms`);
    report.push(`- Operations/Second: ${result.operationsPerSecond.toFixed(2)}`);
    report.push(`- Conflict Resolution Success: ${(result.successRate * 100).toFixed(2)}%`);
    report.push(`- P95 AI Latency: ${result.p95Latency.toFixed(2)}ms`);
    report.push('');
  });
  
  return report.join('\n');
}

// Execute tests when this file is run directly
if (require.main === module) {
  runLoadTests()
    .then(results => {
      console.log("Load testing completed successfully");
      
      // Generate and save markdown report
      const fs = require('fs');
      const reportPath = './load-test-report.md';
      const reportContent = generateMarkdownReport(results);
      
      fs.writeFileSync(reportPath, reportContent);
      console.log(`Report saved to ${reportPath}`);
      
      // Exit with appropriate code based on validation result
      process.exit(results.validationResult.passed ? 0 : 1);
    })
    .catch(err => {
      console.error("Load testing failed:", err);
      process.exit(1);
    });
}

// Export for programmatic usage
export { runCombinedLoadTest, runLoadTests, validateAgainstTargets };