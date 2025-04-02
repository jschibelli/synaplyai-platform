import { jest } from '@jest/globals';

/**
 * Mock implementation of tenant context management
 */

// Store for the current tenant context in tests
let mockTenantContext: any = {
  tenantId: 'default-tenant',
  userId: 'default-user',
  features: {
    enableCollaboration: true,
    enableAI: true,
    maxDocuments: 100
  }
};

/**
 * Get the current tenant context
 */
export const getTenantContextMock = jest.fn().mockImplementation(() => {
  return mockTenantContext;
});

/**
 * Set the tenant context for testing
 */
export const setTenantContextMock = jest.fn().mockImplementation((context: any) => {
  mockTenantContext = {
    ...mockTenantContext,
    ...context
  };
  return mockTenantContext;
});

/**
 * Clear the tenant context
 */
export const clearTenantContextMock = jest.fn().mockImplementation(() => {
  mockTenantContext = {
    tenantId: 'default-tenant',
    userId: 'default-user',
    features: {
      enableCollaboration: true,
      enableAI: true,
      maxDocuments: 100
    }
  };
});

export default {
  getTenantContextMock,
  setTenantContextMock,
  clearTenantContextMock
};