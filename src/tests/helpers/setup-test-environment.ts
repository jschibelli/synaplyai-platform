import { jest } from '@jest/globals';
import { CircuitState } from '../../lib/circuit-breaker';

/**
 * Sets up standard mocks for test environment
 */
export function setupTestEnvironment() {
  // Mock metrics collector
  const mockMetricsCollector = {
    increment: jest.fn().mockResolvedValue(undefined),
    incrementCounter: jest.fn().mockResolvedValue(undefined),
    recordLatency: jest.fn().mockResolvedValue(undefined),
    recordValue: jest.fn().mockResolvedValue(undefined),
    track: jest.fn().mockResolvedValue(undefined),
    getAverageValue: jest.fn().mockResolvedValue(0),
    getPercentileLatency: jest.fn().mockResolvedValue(0)
  };

  // Mock circuit breaker
  const mockCircuitBreaker = {
    execute: jest.fn().mockImplementation((fn) => fn()),
    executeWithBulkhead: jest.fn().mockImplementation((fn) => fn()),
    getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    transitionState: jest.fn().mockResolvedValue(undefined),
    shouldAttemptReset: jest.fn().mockReturnValue(false),
    options: {
      failureThreshold: 5,
      resetTimeout: 30000
    },
    serviceName: 'test-service'
  };

  // Mock tenant context
  const mockTenantContext = {
    tenantId: 'test-tenant-id',
    userId: 'test-user-id',
    getCurrentTenant: jest.fn().mockReturnValue({
      id: 'test-tenant-id',
      name: 'Test Tenant',
      subscription: { plan: 'business' }
    }),
    getCurrentUser: jest.fn().mockReturnValue({
      id: 'test-user-id',
      name: 'Test User'
    })
  };

  return {
    mockMetricsCollector,
    mockCircuitBreaker,
    mockTenantContext
  };
}