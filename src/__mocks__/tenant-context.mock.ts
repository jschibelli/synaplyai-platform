
import { TenantContext } from '../types/shared-interfaces';

export const mockTenantContext = (tenantId = 'test-tenant', userId = 'test-user'): TenantContext => ({
  tenantId,
  userId,
  requestId: `req-${Math.random().toString(36).substring(2, 9)}`,
  traceId: `trace-${Math.random().toString(36).substring(2, 9)}`
});

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

export function mockTenantContext(tenantId = 'test-tenant', userId = 'test-user') {
  return {
    tenantId,
    userId,
    requestId: `req-${Math.random().toString(36).substring(2, 9)}`,
    traceId: `trace-${Math.random().toString(36).substring(2, 9)}`
  };
}

export const getTenantContextMock = jest.fn().mockReturnValue(mockTenantContext());
export const setTenantContextMock = jest.fn();
export const clearTenantContextMock = jest.fn();
export const getCurrentTenantIdMock = jest.fn().mockReturnValue('test-tenant');
export const getCurrentUserIdMock = jest.fn().mockReturnValue('test-user');
export const setCurrentTenantContext = jest.fn();


