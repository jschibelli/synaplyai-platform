export function mockTenantContext(tenantId: string, userId: string): void {
  jest.resetModules();
  
  jest.doMock('../lib/tenant-context', () => ({
    getTenantContext: jest.fn().mockReturnValue({
      tenantId,
      userId,
      requestId: 'test-request',
      traceId: 'test-trace'
    }),
    getCurrentTenantId: jest.fn().mockReturnValue(tenantId),
    setTenantContext: jest.fn(),
    clearTenantContext: jest.fn()
  }));
}

export function clearTenantContext(): void {
  jest.resetModules();
  
  jest.doMock('../lib/tenant-context', () => ({
    getTenantContext: jest.fn().mockReturnValue(undefined),
    getCurrentTenantId: jest.fn().mockReturnValue(undefined),
    setTenantContext: jest.fn(),
    clearTenantContext: jest.fn()
  }));
}