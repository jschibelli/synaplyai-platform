import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tenant context information
 */
export interface TenantContext {
  tenantId: string;
  userId?: string;        // Keep optional for flexibility
  traceId?: string;
  requestId?: string;
  sessionId?: string;
  [key: string]: any;     // Allow additional properties
}

// Store tenant context in AsyncLocalStorage
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
 * Get the current tenant ID from context
 */
export function getCurrentTenantId(): string | undefined {
  const context = tenantContextStorage.getStore();
  return context?.tenantId;
}

/**
 * Get the current user ID from context
 */
export function getCurrentUserId(): string | undefined {
  const context = tenantContextStorage.getStore();
  return context?.userId;
}

/**
 * Get the complete tenant context
 */
export function getTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Set tenant context for the current async scope
 */
export function setTenantContext(context: TenantContext): void {
  tenantContextStorage.enterWith(context);
}

/**
 * Clear the current tenant context
 */
export function clearTenantContext(): void {
  // Note: AsyncLocalStorage doesn't have a direct way to clear context
  // Setting an empty context is the closest equivalent
  tenantContextStorage.enterWith({} as any);
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
 * Set the current tenant context with individual properties
 */
export function setCurrentTenantContext(
  tenantId: string,
  userId?: string,
  options: { traceId?: string; requestId?: string; sessionId?: string } = {}
): void {
  const context: TenantContext = {
    tenantId,
    userId,
    ...options
  };
  setTenantContext(context);
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

// Export storage for direct access in tests
export { tenantContextStorage };