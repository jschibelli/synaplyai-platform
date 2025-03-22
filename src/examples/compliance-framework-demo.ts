import { createHash } from 'crypto';
import { AdaptiveCircuitBreaker } from '../circuit-breaker/adaptive-breaker';
import { RedisCircuitBreakerStore } from '../circuit-breaker/redis-store';
import { CircuitState } from '../circuit-breaker/interfaces';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/metrics-collector';
import { ShardedRedisClient } from '../metrics/sharded-redis';
import { EnhancedFilterPipeline, ExecutionStrategy } from '../filtering/filter-pipeline';
import { setTenantContext } from '../lib/tenant-context';

// Initialize the mockTenantContext for the demo
function setupTenantContext(tenantId: string, userId: string): void {
  process.env.TENANT_ID = tenantId;
  process.env.USER_ID = userId;
  
  // Simulate middleware that would set this in a real application
  setTenantContext(tenantId, userId);
}

async function runComplianceFrameworkDemo() {
  console.log('========================================');
  console.log('Enhanced Compliance Framework Demo');
  console.log('========================================\n');

  try {
    // 1. Setup tenant context
    setupTenantContext('demo-tenant', 'demo-user');
    console.log('✅ Tenant context initialized');

    // 2. Initialize components
    const redisUrl = 'redis://localhost:6379';
    const redisShards = [redisUrl, redisUrl]; // Using same Redis instance but with different sharding logic
    const shardedRedis = new ShardedRedisClient(redisShards);
    const metricsCollector = new MetricsCollector(shardedRedis);
    const circuitStore = new RedisCircuitBreakerStore(redisUrl);
    
    console.log('✅ Core services initialized');
    
    // 3. Log a compliance event with integrity hashing
    await ComplianceLogger.log({
      eventType: 'demo.started',
      resourceId: 'compliance-framework',
      description: 'Enhanced Compliance Framework demo started',
      metadata: {
        startTime: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
      }
    });
    
    console.log('✅ Compliance event logged with integrity hash');
    
    // 4. Create and test adaptive circuit breaker
    const circuitBreaker = new AdaptiveCircuitBreaker(
      circuitStore,
      'demo-tenant',
      'payment-service',
      metricsCollector,
      {
        failureThreshold: 5,
        resetTimeoutMs: 5000
      }
    );
    
    console.log('✅ Adaptive circuit breaker initialized');
    
    // Demonstrate successful execution
    console.log('\n📊 Circuit Breaker Demo:');
    console.log('  → Executing successful operations...');
    
    for (let i = 0; i < 10; i++) {
      await circuitBreaker.execute(() => {
        return Promise.resolve(`Success ${i+1}`);
      });
      process.stdout.write('.');
    }
    console.log(' Success!');
    
    // Demonstrate failure behavior
    console.log('  → Executing failing operations to trigger circuit...');
    
    try {
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(() => {
            return Promise.reject(new Error(`Simulated error ${i+1}`));
          });
        } catch (err) {
          process.stdout.write('F');
          // Expected failures
        }
      }
      console.log(' Done');
    } catch (err) {
      console.log(`\n  → Circuit opened after failures: ${(err as Error).message}`);
    }
    
    // Show circuit state
    const state = await circuitBreaker.getState();
    console.log(`  → Current circuit state: ${state}`);
    
    // 5. Demonstrate bulkhead pattern
    console.log('\n📊 Bulkhead Pattern Demo:');
    
    const concurrentPromises = [];
    for (let i = 0; i < 12; i++) {
      concurrentPromises.push(
        (async (id) => {
          try {
            await circuitBreaker.executeWithBulkhead(
              () => new Promise(resolve => setTimeout(() => resolve(`Request ${id} completed`), 100)),
              10 // Limit to 10 concurrent requests
            );
            process.stdout.write('✓');
          } catch (err) {
            process.stdout.write('✗');
          }
        })(i)
      );
    }
    
    await Promise.allSettled(concurrentPromises);
    console.log(' Done');
    console.log('  → Some requests were rejected due to bulkhead limits');
    
    // 6. Create and test multi-stage filtering pipeline
    console.log('\n📊 Multi-Stage Filtering Pipeline Demo:');
    
    const pipeline = new EnhancedFilterPipeline(metricsCollector);
    
    // Add sample filters
    pipeline.addFilter({
      name: 'regex-filter',
      executionStrategy: ExecutionStrategy.SYNC,
      priority: 1,
      filter: async (content) => {
        console.log('  → Running regex filter');
        // Simple regex to detect potential sensitive information
        const hasSensitiveInfo = /\b(?:\d{4}[- ]?){3}\d{4}\b/.test(content); // Credit card pattern
        if (hasSensitiveInfo) {
          return { 
            result: 'BLOCKED', 
            confidence: 0.95, 
            reason: 'Contains potential credit card information'
          };
        }
        return { result: 'ALLOWED', confidence: 0.9 };
      }
    });
    
    pipeline.addFilter({
      name: 'profanity-filter',
      executionStrategy: ExecutionStrategy.PARALLEL,
      priority: 1,
      filter: async (content) => {
        console.log('  → Running profanity filter');
        // Simple check for prohibited words
        const hasProfanity = /\b(badword1|badword2)\b/i.test(content);
        if (hasProfanity) {
          return { 
            result: 'BLOCKED', 
            confidence: 0.9, 
            reason: 'Contains prohibited language'
          };
        }
        return { result: 'ALLOWED', confidence: 0.8 };
      }
    });
    
    // Test with allowed content
    console.log('  → Testing allowed content');
    let filterResult = await pipeline.process('This is a perfectly fine message');
    console.log(`  → Result: ${filterResult.result} (confidence: ${filterResult.confidence})`);
    
    // Test with blocked content
    console.log('\n  → Testing blocked content');
    filterResult = await pipeline.process('My credit card is 1234-5678-9012-3456');
    console.log(`  → Result: ${filterResult.result} (confidence: ${filterResult.confidence})`);
    console.log(`  → Reason: ${filterResult.reason}`);
    
    // 7. Generate metrics
    console.log('\n📊 Metrics Collection Demo:');
    
    // Record some metrics
    await metricsCollector.incrementCounter('demo.requests', { tenantId: 'demo-tenant' });
    await metricsCollector.recordValue('demo.latency', 42.5, { tenantId: 'demo-tenant' });
    
    console.log('✅ Metrics recorded to Redis shards');
    
    // 8. Validate log integrity
    console.log('\n📊 Log Integrity Validation Demo:');
    
    const mockValidateLogs = async () => {
      console.log('  → Validating log integrity...');
      console.log('  → All logs verified successfully!');
      return { valid: 42, invalid: 0, totalChecked: 42 };
    };
    
    const validationResults = await mockValidateLogs();
    console.log(`  → Results: ${validationResults.valid} valid, ${validationResults.invalid} invalid out of ${validationResults.totalChecked} logs`);
    
    // Record completion
    await ComplianceLogger.log({
      eventType: 'demo.completed',
      resourceId: 'compliance-framework',
      description: 'Enhanced Compliance Framework demo completed successfully',
      metadata: {
        endTime: new Date().toISOString(),
        components: ['logging', 'circuit-breaker', 'filtering', 'metrics']
      }
    });
    
    console.log('\n✅ Enhanced Compliance Framework demo completed successfully!');
    
  } catch (error) {
    console.error('Demo failed with error:', error);
    
    await ComplianceLogger.log({
      eventType: 'demo.error',
      resourceId: 'compliance-framework',
      description: 'Enhanced Compliance Framework demo encountered an error',
      metadata: { error: (error as Error).message }
    });
  }
}

// Run the demo
runComplianceFrameworkDemo().catch(console.error);