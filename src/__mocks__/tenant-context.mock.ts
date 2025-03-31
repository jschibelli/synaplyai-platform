import { jest } from '@jest/globals';

// Define TenantContext interface locally to avoid import issues
interface TenantContext {
  tenantId: string;
  userId: string;
  orgName: string;
  tier: string;
  features: {
    collaborativeEditing: boolean;
    aiAssistant: boolean;
    advancedAnalytics: boolean;
    prioritySupport: boolean;
  };
  limits: {
    maxUsers: number;
    maxProjects: number;
    maxStorageGB: number;
    maxRequestsPerMinute: number;
  };
  preferences: {
    theme: string;
    language: string;
    timezone: string;
  };
}

/**
 * Factory function to create tenant context mocks
 * 
 * @param tenantId Optional tenant ID (defaults to 'test-tenant')
 * @param userId Optional user ID (defaults to 'test-user')
 * @returns A mock tenant context object
 */
export function createTenantContextMock(tenantId = 'test-tenant', userId = 'test-user'): TenantContext {
  return {
    tenantId,
    userId,
    orgName: 'Test Organization',
    tier: 'enterprise',
    features: {
      collaborativeEditing: true,
      aiAssistant: true,
      advancedAnalytics: true,
      prioritySupport: true
    },
    limits: {
      maxUsers: 50,
      maxProjects: 100,
      maxStorageGB: 500,
      maxRequestsPerMinute: 1000
    },
    preferences: {
      theme: 'light',
      language: 'en',
      timezone: 'UTC'
    }
  };
}

// Create a pre-initialized instance as a named export
export const mockTenantContext = createTenantContextMock();

// Mock the AsyncLocalStorage run method
const mockContextMap = new Map<string, any>();

export const tenantContextStorage = {
  run: (context: any, fn: () => any) => {
    const previousContext = getTenantContextMock();
    setTenantContextMock(context);
    try {
      return fn();
    } finally {
      setTenantContextMock(previousContext);
    }
  }
};

// Export getter and setter functions
export const getTenantContextMock = jest.fn().mockReturnValue(mockTenantContext);
export const setTenantContextMock = jest.fn();
export const clearTenantContextMock = jest.fn();
export const getCurrentTenantIdMock = jest.fn().mockReturnValue('test-tenant');
export const getCurrentUserIdMock = jest.fn().mockReturnValue('test-user');
export const setCurrentTenantContext = jest.fn();


