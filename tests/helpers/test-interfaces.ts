import { jest } from '@jest/globals';
import { TenantContext } from '../../src/tenant/TenantContext';
import { MetricsCollector } from '../../src/services/metrics/MetricsCollector';
import { PrismaClient } from '@prisma/client';
import { AICommandContext } from '../../src/ai/AICommandContext';
import { CircuitBreaker } from '../../src/circuit-breaker/CircuitBreaker';

// For tenant context mock in tests
export interface EnhancedTenantContext extends TenantContext {
  getCurrentTenant?: jest.Mock;
  getTenantId?: jest.Mock;
  [key: string]: any;
}

// For metrics collector mock in tests
export interface EnhancedMetricsCollector extends MetricsCollector {
  recordValue: jest.Mock;
  track: jest.Mock;
  incrementCounter: jest.Mock;
  increment: jest.Mock;
  getCounter: jest.Mock;
  [key: string]: any;
}

// For circuit breaker mock in tests
export interface EnhancedCircuitBreaker extends CircuitBreaker {
  executeWithBulkhead: jest.Mock;
  [key: string]: any;
}

// For prisma mock in tests
export interface EnhancedPrismaClient extends PrismaClient {
  event: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    count: jest.Mock;
    update: jest.Mock;
    deleteMany: jest.Mock;
    [key: string]: jest.Mock;
  };
  snapshot: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    deleteMany: jest.Mock;
    [key: string]: jest.Mock;
  };
  [key: string]: any;
}

// Helper function to create AI command context for tests
export function createTestAICommandContext(override: Partial<AICommandContext> = {}): AICommandContext {
  return {
    documentId: 'test-doc-1',
    userId: 'test-user-1',
    tenantId: 'test-tenant-1',
    content: 'Test content',
    selectedText: 'Selected text',
    precedingText: 'Preceding text',
    followingText: 'Following text',
    parameters: {
      windowSize: 500,
      includePreceding: true,
      includeFollowing: true,
      includeDocument: true
    },
    ...override
  };
}