import { CursorManager } from '../../src/collaboration/CursorManager';
import { MetricsCollector } from '../../src/metrics/collector';
import { TenantContext } from '../../src/lib/tenant-context';
import { RedisMetricsClient } from '../../src/metrics/redis-client';
import Redis from 'ioredis';

// Create mock implementations
const mockRedisClient = {
  incrementCounter: jest.fn(),
  recordLatency: jest.fn(),
  getPercentileLatency: jest.fn(),
  getAverageLatency: jest.fn(),
  setCircuitBreakerState: jest.fn(),
  getCircuitBreakerState: jest.fn(),
  getFilterLatency: jest.fn(),
  getPipelineMetrics: jest.fn(),
  incrementFilterResult: jest.fn(),
  getBucketKey: jest.fn(),
  getSpecificBucketKey: jest.fn(),
  increment: jest.fn(),
  recordValue: jest.fn(),
  getMetricValue: jest.fn(),
  getMetricCounts: jest.fn(),
  getFilterResultCounts: jest.fn(),
  getPipelineLatency: jest.fn(),
  pipeline: jest.fn(() => ({
    exec: jest.fn().mockResolvedValue([])
  }))
} as unknown as RedisMetricsClient;

const mockMetricsCollector = {
  track: jest.fn(),
  increment: jest.fn(),
  recordLatency: jest.fn(),
  getPercentileLatency: jest.fn(),
  setCircuitBreakerState: jest.fn(),
  getCircuitBreakerState: jest.fn(),
  incrementCircuitBreakerFailures: jest.fn(),
  incrementCircuitBreakerRejections: jest.fn(),
  incrementFilterResult: jest.fn(),
  recordFilterLatency: jest.fn(),
  recordPipelineLatency: jest.fn(),
  incrementPipelineResult: jest.fn(),
  incrementPipelineErrors: jest.fn(),
  trackIdentifier: jest.fn(),
  trackEvent: jest.fn(),
  trackMetric: jest.fn(),
  trackValue: jest.fn(),
  getFilterResults: jest.fn(),
  getPipelineLatency: jest.fn()
} as unknown as MetricsCollector;

// Mock the tenant context module
jest.mock('../../src/lib/tenant-context', () => {
  let currentContext: TenantContext | null = null;
  return {
    getTenantContext: jest.fn(() => currentContext),
    setTenantContext: jest.fn((ctx: TenantContext) => { currentContext = ctx; }),
    clearTenantContext: jest.fn(() => { currentContext = null; }),
  };
});

const { getTenantContext, setTenantContext, clearTenantContext } = require('../../src/lib/tenant-context');

describe('CursorManager', () => {
  let cursorManager: CursorManager;
  
  beforeEach(() => {
    jest.clearAllMocks();
    clearTenantContext();
    cursorManager = new CursorManager(mockMetricsCollector);
  });
  
  afterEach(() => {
    cursorManager.dispose();
    clearTenantContext();
  });
  
  test('should update and retrieve cursor positions with tenant isolation', () => {
    // Set tenant context for tenant 1
    setTenantContext({
      tenantId: 'tenant-1', 
      userId: 'user-1',
      requestId: 'request-1',
      traceId: 'trace-1'
    });
    
    // Update cursor position
    cursorManager.updateCursorPosition('doc-1', 'user-1', 10, undefined, 'User 1');
    
    // Check cursor
    const cursors = cursorManager.getDocumentCursors('doc-1');
    expect(cursors).toHaveLength(1);
    expect(cursors[0].position).toBe(10);
    
    // Set tenant context for tenant 2
    setTenantContext({
      tenantId: 'tenant-2', 
      userId: 'user-2',
      requestId: 'request-2',
      traceId: 'trace-2'
    });
    
    // Verify isolation
    const cursors2 = cursorManager.getDocumentCursors('doc-1');
    expect(cursors2).toHaveLength(0);
  });
  
  test('should adjust cursor positions after text insertion', () => {
    // Simplified: Use direct context setting instead of run
    setTenantContext({
      tenantId: 'tenant-1', 
      userId: 'user-1',
      requestId: 'request-1',
      traceId: 'trace-1'
    });
    
    // Set up initial cursors
    cursorManager.updateCursorPosition('doc-1', 'user-1', 5);  
    cursorManager.updateCursorPosition('doc-1', 'user-2', 10);
    cursorManager.updateCursorPosition('doc-1', 'user-3', 15);
    
    // Simulate text insertion at position 8
    cursorManager.adjustCursorsForInsertion('doc-1', 8, 3, 'user-1');
    
    // Check cursor adjustments
    const cursors = cursorManager.getDocumentCursors('doc-1');
    const cursorMap = new Map(cursors.map(c => [c.userId, c]));
    
    expect(cursorMap.get('user-1')?.position).toBe(5);  // Excluded user, no change
    expect(cursorMap.get('user-2')?.position).toBe(13); // After insertion, shifted by 3
    expect(cursorMap.get('user-3')?.position).toBe(18); // After insertion, shifted by 3
  });

  // Add test for deletion operations
  test('should adjust cursor positions after text deletion', () => {
    // Simplified: Use direct context setting
    setTenantContext({
      tenantId: 'tenant-1', 
      userId: 'user-1',
      requestId: 'request-1',
      traceId: 'trace-1'
    });
    
    // Set up initial cursors
    cursorManager.updateCursorPosition('doc-1', 'user-1', 5);  
    cursorManager.updateCursorPosition('doc-1', 'user-2', 15);
    cursorManager.updateCursorPosition('doc-1', 'user-3', 25);
    
    // Simulate text deletion: delete 5 chars starting at position 10
    cursorManager.adjustCursorsForDeletion('doc-1', 10, 5, 'user-1');
    
    // Check cursor adjustments
    const cursors = cursorManager.getDocumentCursors('doc-1');
    const cursorMap = new Map(cursors.map(c => [c.userId, c]));
    
    expect(cursorMap.get('user-1')?.position).toBe(5);   // Excluded user, no change
    expect(cursorMap.get('user-2')?.position).toBe(10);  // Within deletion range, moved to start of deletion
    expect(cursorMap.get('user-3')?.position).toBe(20);  // After deletion, shifted back by 5
  });

  // Add test for selection ranges
  test('should adjust selection ranges during text operations', () => {
    // Simplified: Use direct context setting
    setTenantContext({
      tenantId: 'tenant-1', 
      userId: 'user-1',
      requestId: 'request-1',
      traceId: 'trace-1'
    });
    
    // Set up cursors with selections
    cursorManager.updateCursorPosition('doc-1', 'user-1', 5, { start: 5, end: 10 });
    cursorManager.updateCursorPosition('doc-1', 'user-2', 15, { start: 12, end: 18 });
    
    // Simulate text insertion at position 8
    cursorManager.adjustCursorsForInsertion('doc-1', 8, 3, 'user-1');
    
    // Check selection adjustments
    const cursors = cursorManager.getDocumentCursors('doc-1');
    const cursorMap = new Map(cursors.map(c => [c.userId, c]));
    
    // User 1 (excluded) - selection unchanged
    expect(cursorMap.get('user-1')?.selection).toEqual({ start: 5, end: 10 });
    
    // User 2 - selection shifted by insertion
    expect(cursorMap.get('user-2')?.selection).toEqual({ start: 15, end: 21 });
  });
});