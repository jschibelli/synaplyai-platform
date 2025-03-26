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