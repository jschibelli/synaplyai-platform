import { AsyncLocalStorage } from 'async_hooks';

export interface TenantContext {
  tenantId: string;
  userId: string;
  requestId: string;
  traceId: string;
}

// Create AsyncLocalStorage instance for tenant context
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

// Helper functions to access the current context
export function getCurrentTenantId(): string | undefined {
  return tenantContextStorage.getStore()?.tenantId;
}

export function getCurrentUserId(): string | undefined {
  return tenantContextStorage.getStore()?.userId;
}

export function getCurrentRequestId(): string | undefined {
  return tenantContextStorage.getStore()?.requestId;
}

export function getCurrentContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}