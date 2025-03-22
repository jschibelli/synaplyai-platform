import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import { ComplianceLogger } from '../compliance/logger';
import { AdaptiveCircuitBreaker } from '../circuit-breaker/adaptive-breaker';
import { RedisCircuitBreakerStore } from '../circuit-breaker/redis-store';
import { CircuitState } from '../circuit-breaker/interfaces';
import { MetricsCollector } from '../metrics/metrics-collector';
import { ShardedRedisClient } from '../metrics/sharded-redis';
import { EnhancedFilterPipeline, ExecutionStrategy } from '../filtering/filter-pipeline';
import { mockTenantContext, clearTenantContext } from '../__mocks__/tenant-context';

// Mock Redis clients to avoid actual Redis dependencies in tests
jest.mock('redis', () => {
  const mockClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn(),
    decr: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
    del: jest.fn().mockResolvedValue(1),
    hIncrBy: jest.fn(),
    zAdd: jest.fn(),
    hGetAll: jest.fn(),
    hGet: jest.fn(),
    hSet: jest.fn(),
    multi: jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue([])
    })
  };
  
  return {
    createClient: jest.fn().mockImplementation(() => mockClient)
  };
});

jest.mock('../prisma/client', () => ({
  prisma: {
    complianceLog: {
      create: jest.fn().mockResolvedValue({ id: 'mock-log-id' }),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    },
    complianceAudit: {
      create: jest.fn().mockResolvedValue({ id: 'mock-audit-id' })
    }
  }
}));

describe('Enhanced Compliance Framework', () => {
  let metricsCollector: MetricsCollector;
  let redisStore: RedisCircuitBreakerStore;
  
  beforeAll(() => {
    // Setup mock tenant context for testing
    mockTenantContext('tenant-123', 'user-456');
    
    // Initialize metrics collector with mock Redis client
    const shardedRedis = new ShardedRedisClient(['redis://localhost:6379']);
    metricsCollector = new MetricsCollector(shardedRedis);
    
    // Initialize Redis circuit breaker store
    redisStore = new RedisCircuitBreakerStore('redis://localhost:6379');
  });
  
  afterAll(() => {
    clearTenantContext();
  });
  
  describe('Partitioned Logging with Integrity Hashing', () => {
    test('should log compliance events with evidence hash', async () => {
      const logEntry = {
        eventType: 'user.login',
        resourceId: 'resource-789',
        description: 'User login successful',
        metadata: { ip: '192.168.1.1', browser: 'Chrome' }
      };
      
      await ComplianceLogger.log(logEntry);
      
      // Verify that prisma.complianceLog.create was called with correct parameters
      const { prisma } = require('../prisma/client');
      expect(prisma.complianceLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tenant-123',
            eventType: 'user.login',
            resourceId: 'resource-789',
            userId: 'user-456',
            description: 'User login successful',
            evidenceHash: expect.any(String) // Verify hash is present
          })
        })
      );
    });
    
    test('should validate log integrity', async () => {
      // Setup mock logs with valid hashes
      const { prisma } = require('../prisma/client');
      const mockLogs = [
        {
          id: 'log-1',
          tenantId: 'tenant-123',
          eventType: 'user.login',
          description: 'User login successful',
          metadata: '{"ip":"192.168.1.1"}',
          createdAt: new Date(),
          evidenceHash: 'valid-hash-1'
        },
        {
          id: 'log-2',
          tenantId: 'tenant-123',
          eventType: 'resource.access',
          description: 'Resource accessed',
          metadata: '{"resourceId":"res-123"}',
          createdAt: new Date(),
          evidenceHash: 'valid-hash-2'
        }
      ];
      
      prisma.complianceLog.findMany.mockResolvedValue(mockLogs);
      
      // Mock the hash generation function to return fixed values matching our mocks
      const originalGenerateEvidenceHash = (ComplianceLogger as any).generateEvidenceHash;
      (ComplianceLogger as any).generateEvidenceHash = jest.fn()
        .mockReturnValueOnce('valid-hash-1')
        .mockReturnValueOnce('invalid-hash'); // Simulate tampered log
        
      try {
        const violations = await ComplianceLogger.validateLogs('tenant-123');
        
        expect(violations).toHaveLength(1);
        expect(violations[0].id).toBe('log-2');
        expect(violations[0].issue).toContain('Hash mismatch');
        
        // Verify audit log was created for the violation
        expect(prisma.complianceAudit.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              operation: 'INTEGRITY_CHECK',
              recordId: 'log-2'
            })
          })
        );
      } finally {
        // Restore original function
        (ComplianceLogger as any).generateEvidenceHash = originalGenerateEvidenceHash;
      }
    });
  });
  
  describe('Adaptive Circuit Breaker', () => {
    test('should adapt thresholds based on error rates', async () => {
      // Mock store methods for testing
      redisStore.getState = jest.fn().mockResolvedValue(CircuitState.CLOSED);
      redisStore.incrementFailures = jest.fn().mockResolvedValue(0);
      redisStore.resetCounters = jest.fn().mockResolvedValue(undefined);
      
      const circuitBreaker = new AdaptiveCircuitBreaker(
        redisStore,
        'tenant-123',
        'test-service',
        metricsCollector,
        {
          failureThreshold: 5,
          resetTimeoutMs: 10000
        }
      );
      
      // Mock ComplianceLogger to verify threshold adjustments
      ComplianceLogger.log = jest.fn().mockResolvedValue(undefined);
      
      // Simulate successful requests
      for (let i = 0; i < 25; i++) {
        await circuitBreaker.execute(() => Promise.resolve('success'));
      }
      
      // Simulate error conditions - high error rate
      for (let i = 0; i < 10; i++) {
        try {
          await circuitBreaker.execute(() => Promise.reject(new Error('test error')));
        } catch (error) {
          // Expected
        }
      }
      
      // Force threshold update
      await (circuitBreaker as any).updateThresholds();
      
      // Check that ComplianceLogger was called with threshold adjustment event
      expect(ComplianceLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'circuit.threshold.adjusted',
          resourceId: 'test-service'
        })
      );
    });
    
    test('should implement bulkhead pattern', async () => {
      const circuitBreaker = new AdaptiveCircuitBreaker(
        redisStore,
        'tenant-123',
        'test-service',
        metricsCollector
      );
      
      // Mock store methods for bulkhead testing
      const store = circuitBreaker['getStore']();
      store.incrementCounter = jest.fn()
        .mockResolvedValueOnce(5)  // First call - under limit
        .mockResolvedValueOnce(11); // Second call - over limit
      store.decrementCounter = jest.fn().mockResolvedValue(0);
      
      // First call should succeed
      const result = await circuitBreaker.executeWithBulkhead(
        () => Promise.resolve('success'),
        10 // concurrencyLimit
      );
      
      expect(result).toBe('success');
      expect(store.incrementCounter).toHaveBeenCalled();
      expect(store.decrementCounter).toHaveBeenCalled();
      
      // Second call should fail due to bulkhead limit
      await expect(
        circuitBreaker.executeWithBulkhead(
          () => Promise.resolve('success'),
          10 // concurrencyLimit
        )
      ).rejects.toThrow('Bulkhead limit reached');
    });
  });
  
  describe('Enhanced Filter Pipeline', () => {
    test('should execute filters in correct order with early exit', async () => {
      const pipeline = new EnhancedFilterPipeline(metricsCollector);
      
      // Mock filters with different execution strategies
      const syncFilter1 = {
        name: 'syncFilter1',
        executionStrategy: ExecutionStrategy.SYNC,
        priority: 1,
        filter: jest.fn().mockResolvedValue({ result: 'ALLOWED', confidence: 0.9 })
      };
      
      const syncFilter2 = {
        name: 'syncFilter2',
        executionStrategy: ExecutionStrategy.SYNC,
        priority: 2,
        filter: jest.fn().mockResolvedValue({ result: 'BLOCKED', confidence: 0.95, reason: 'Prohibited content' })
      };
      
      const parallelFilter = {
        name: 'parallelFilter',
        executionStrategy: ExecutionStrategy.PARALLEL,
        priority: 1,
        filter: jest.fn().mockResolvedValue({ result: 'ALLOWED', confidence: 0.8 })
      };
      
      // Add filters to pipeline
      pipeline.addFilter(syncFilter1);
      pipeline.addFilter(parallelFilter);
      pipeline.addFilter(syncFilter2);
      
      // Process content - should early exit at syncFilter2
      const result = await pipeline.process('test content');
      
      expect(result.result).toBe('BLOCKED');
      expect(result.confidence).toBe(0.95);
      
      // Verify execution order and early exit
      expect(syncFilter1.filter).toHaveBeenCalledTimes(1);
      expect(syncFilter2.filter).toHaveBeenCalledTimes(1);
      expect(parallelFilter.filter).not.toHaveBeenCalled(); // Should not be called due to early exit
    });
    
    test('should execute parallel filters simultaneously', async () => {
      const pipeline = new EnhancedFilterPipeline(metricsCollector);
      
      // Mock syncFilter that allows content
      const syncFilter = {
        name: 'syncFilter',
        executionStrategy: ExecutionStrategy.SYNC,
        priority: 1,
        filter: jest.fn().mockResolvedValue({ result: 'ALLOWED', confidence: 0.9 })
      };
      
      // Mock parallel filters with delays
      const createDelayedFilter = (name: string, delay: number, result: string) => ({
        name,
        executionStrategy: ExecutionStrategy.PARALLEL,
        priority: 1,
        filter: jest.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, delay));
          return { result, confidence: 0.8 };
        })
      });
      
      const parallelFilter1 = createDelayedFilter('parallelFilter1', 50, 'ALLOWED');
      const parallelFilter2 = createDelayedFilter('parallelFilter2', 25, 'BLOCKED');
      
      // Add filters to pipeline
      pipeline.addFilter(syncFilter);
      pipeline.addFilter(parallelFilter1);
      pipeline.addFilter(parallelFilter2);
      
      // Process content - should run parallel filters simultaneously
      const startTime = Date.now();
      const result = await pipeline.process('test content');
      const endTime = Date.now();
      
      // Result should be blocked from parallelFilter2
      expect(result.result).toBe('BLOCKED');
      
      // Verify parallel execution - total time should be closer to the longest delay 
      // than the sum of both delays if executed in parallel
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(100); // Both filters combined would be 75ms
      
      // Verify both parallel filters were called
      expect(syncFilter.filter).toHaveBeenCalledTimes(1);
      expect(parallelFilter1.filter).toHaveBeenCalledTimes(1);
      expect(parallelFilter2.filter).toHaveBeenCalledTimes(1);
    });
  });
  
  describe('Sharded Redis Metrics', () => {
    test('should record metrics with TTL expiration', async () => {
      const shardedRedis = new ShardedRedisClient(['redis://localhost:6379']);
      
      // Mock Redis methods
      const mockRedisClient = require('redis').createClient();
      mockRedisClient.incrBy.mockResolvedValue(1);
      mockRedisClient.expire.mockResolvedValue(1);
      
      // Test storing bucketed values
      await shardedRedis.storeBucketedValue(
        'tenant-123',
        'api.requests',
        1,
        'minute'
      );
      
      // Verify incrBy and expire were called
      expect(mockRedisClient.incrBy).toHaveBeenCalled();
      expect(mockRedisClient.expire).toHaveBeenCalled();
      
      // Test storing time series data
      await shardedRedis.recordTimeSeriesValue(
        'tenant-123',
        'api.latency',
        42.5
      );
      
      // Verify zAdd was called for time series
      expect(mockRedisClient.zAdd).toHaveBeenCalled();
    });
  });
});