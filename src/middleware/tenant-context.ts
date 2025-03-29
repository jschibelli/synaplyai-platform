/**
 * Tenant context object
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
  requestId?: string;
  traceId?: string;
  [key: string]: any;
}

// Store tenant context in AsyncLocalStorage or similar
const tenantContextStore: Record<string, TenantContext> = {};
let currentContext: TenantContext = {
  tenantId: 'demo-tenant',
  userId: 'demo-user'
};

/**
 * Set the current tenant context
 */
export function setCurrentTenantContext(context: Partial<TenantContext>): void {
  currentContext = {
    ...currentContext,
    ...context
  };
}

/**
 * Get the current tenant context
 */
export function getCurrentTenantContext(): TenantContext {
  return currentContext;
}

/**
 * Get the current tenant ID
 */
export function getCurrentTenantId(): string {
  return currentContext?.tenantId || 'unknown';
}

/**
 * Set tenant context with properties
 */
export function setCurrentTenantContextWithProperties(properties: Partial<TenantContext>): void {
  setCurrentTenantContext(properties);
}

/**
 * Get tenant context
 */
export function getTenantContext(): TenantContext | null {
  return currentContext || null;
}