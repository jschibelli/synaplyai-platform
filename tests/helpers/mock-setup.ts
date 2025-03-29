import { jest } from '@jest/globals';
import { MetricsCollector } from '../../src/services/metrics/MetricsCollector';
import { TenantContext } from '../../src/lib/tenant-context';
import { CircuitBreaker } from '../../src/circuit-breaker/CircuitBreaker';

/**
 * Create a properly typed mock metrics collector
 */
export function createMockMetricsCollector() {
  return {
    increment: jest.fn(),
    incrementCounter: jest.fn(),
    recordLatency: jest.fn(),
    recordValue: jest.fn(),
    track: jest.fn(),
    getAverageValue: jest.fn().mockResolvedValue(0),
    getPercentileLatency: jest.fn().mockResolvedValue(0)
  } as jest.Mocked<MetricsCollector>;
}

/**
 * Create a properly typed mock tenant context
 */
export function createMockTenantContext() {
  return {
    getCurrentTenant: jest.fn().mockReturnValue({
      id: 'test-tenant-1',
      name: 'Test Tenant',
      subscription: { plan: 'business' }
    }),
    getCurrentUser: jest.fn().mockReturnValue({
      id: 'test-user-1',
      name: 'Test User'
    }),
    tenantId: 'test-tenant-1',
    userId: 'test-user-1'
  } as unknown as jest.Mocked<TenantContext>;
}

/**
 * Create a properly typed mock circuit breaker
 */
export function createMockCircuitBreaker() {
  return {
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn().mockImplementation(fn => fn()),
    getState: jest.fn().mockResolvedValue('CLOSED'),
    recordSuccess: jest.fn(),
    recordFailure: jest.fn(),
    getBreaker: jest.fn().mockReturnValue({
      execute: jest.fn().mockImplementation(fn => fn())
    })
  } as unknown as jest.Mocked<CircuitBreaker>;
}