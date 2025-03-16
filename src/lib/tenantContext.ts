import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

export interface TenantContext {
  tenantId: string;
  userId: string;
  requestId: string;
  traceId: string;
}

const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

export function getCurrentTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

export function getCurrentTenantId(): string | undefined {
  return tenantContextStorage.getStore()?.tenantId;
}

export function setCurrentTenantContext(tenantId: string, userId: string = 'system'): void {
  const context: TenantContext = {
    tenantId,
    userId,
    requestId: uuidv4(),
    traceId: uuidv4()
  };
  
  tenantContextStorage.enterWith(context);
}

export { tenantContextStorage };