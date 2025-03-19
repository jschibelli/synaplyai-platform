import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Interface for tenant context
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;
  roles?: string[];
  features?: Record<string, boolean>;
  requestId?: string;
  traceId?: string;
  [key: string]: any;
}

// Create AsyncLocalStorage for tenant context
const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

/**
 * Create a new tenant context
 */
export function createTenantContext(tenantId: string, userId: string, additionalContext: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId,
    userId,
    ...additionalContext
  };
}

/**
 * Run a function within a tenant context
 */
export function runWithTenantContext<T>(tenantContext: TenantContext, fn: () => T): T {
  return tenantContextStorage.run(tenantContext, fn);
}

/**
 * Run an async function within a tenant context
 */
export async function runWithTenantContextAsync<T>(tenantContext: TenantContext, fn: () => Promise<T>): Promise<T> {
  return tenantContextStorage.run(tenantContext, fn);
}

/**
 * Get the current tenant context
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Middleware to set tenant context for HTTP requests
 */
export function tenantContextMiddleware() {
  return (req: any, res: any, next: () => void) => {
    const tenantId = req.headers['x-tenant-id'] || req.query.tenantId;
    const userId = req.headers['x-user-id'] || req.query.userId || req.user?.id;
    
    if (!tenantId || !userId) {
      return next();
    }
    
    const tenantContext = createTenantContext(tenantId, userId, {
      roles: req.user?.roles || [],
      // Add any additional context from request
      requestId: req.id
    });
    
    runWithTenantContext(tenantContext, next);
  };
}

/**
 * Verify tenant context exists
 */
export function verifyTenantContext(): TenantContext {
  const context = getTenantContext();
  if (!context) {
    throw new Error('No tenant context available');
  }
  return context;
}

/**
 * Verify tenant access to a specific resource
 */
export function verifyTenantAccess(resourceTenantId: string): void {
  const context = verifyTenantContext();
  
  if (context.tenantId !== resourceTenantId) {
    throw new Error('Tenant access denied');
  }
}

/**
 * Helper to set the current tenant context
 */
export function setTenantContext(context: TenantContext): void {
  tenantContextStorage.enterWith(context);
}

/**
 * Helper to get just the tenant ID
 */
export function getCurrentTenantId(): string | undefined {
  return getTenantContext()?.tenantId;
}

/**
 * Helper to get just the user ID
 */
export function getCurrentUserId(): string | undefined {
  return getTenantContext()?.userId;
}

/**
 * For development and testing, provide a default tenant context
 */
export function setDefaultTenantContext() {
  setTenantContext({
    tenantId: 'demo-tenant',
    userId: 'demo-user',
    requestId: `req-${Date.now()}`,
    traceId: `trace-${Date.now()}`
  });
}

// For development purposes only - will be replaced with proper middleware
if (process.env.NODE_ENV !== 'production') {
  setDefaultTenantContext();
}