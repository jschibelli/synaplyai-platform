import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Tenant context interface
 */
export interface TenantContext {
  tenantId: string;
  userId: string;
<<<<<<< HEAD
=======
  requestId?: string;
>>>>>>> debug
  traceId?: string;
  requestId: string;
  features?: Record<string, boolean>;
  roles?: string[];
  [key: string]: any;
}

<<<<<<< HEAD
// Create a singleton instance of AsyncLocalStorage for tenant context
const tenantContextStorage = new AsyncLocalStorage<TenantContext>();
=======
// Create AsyncLocalStorage for tenant context
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

// Default values for testing
let currentContext: TenantContext = {
  tenantId: 'demo-tenant',
  userId: 'demo-user'
};

/**
 * Set the current tenant context for the async scope
 */
export function setCurrentTenantContext(context: TenantContext): void {
  tenantContextStorage.enterWith(context);
}

/**
 * Get the current tenant context from async scope
 */
export function getCurrentTenantContext(): TenantContext | undefined {
  return tenantContextStorage.getStore();
}

/**
 * Get the current tenant ID from context
 */
export function getCurrentTenantId(): string {
  return currentContext?.tenantId || 'unknown';
}

/**
 * Get the current user ID from context
 */
export function getCurrentUserId(): string {
  return currentContext?.userId || 'anonymous';
}

/**
 * Create a middleware to set tenant context for requests
 */
export function tenantContextMiddleware() {
  return (req: any, res: any, next: Function) => {
    const tenantId = req.headers['x-tenant-id'] || 'default';
    const userId = req.headers['x-user-id'] || 'anonymous';
    const requestId = req.headers['x-request-id'] || generateRequestId();
    const traceId = req.headers['x-trace-id'] || requestId;
    
    const context: TenantContext = {
      tenantId,
      userId,
      requestId,
      traceId
    };
    
    tenantContextStorage.run(context, () => {
      next();
    });
  };
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
}

/**
 * Helper to run a function with a specific tenant context
 */
export async function runWithTenantContext<T>(context: TenantContext, fn: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    tenantContextStorage.run(context, async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
  });
}

/**
 * Create a test tenant context for use in tests
 */
export function createTestTenantContext(overrides?: Partial<TenantContext>): TenantContext {
  return {
    tenantId: 'test-tenant',
    userId: 'test-user',
    requestId: 'test-request-id',
    ...overrides
  };
}
>>>>>>> debug

/**
 * Create a new tenant context
 */
export function createTenantContext(tenantId: string, userId: string, additionalContext: Partial<TenantContext> = {}): TenantContext {
  return {
    tenantId,
    userId,
<<<<<<< HEAD
    requestId: additionalContext.requestId || `req-${uuidv4()}`, // Ensure requestId exists
    traceId: additionalContext.traceId || `trace-${uuidv4()}`,
=======
    requestId: additionalContext.requestId || generateRequestId(), // Add a default requestId
>>>>>>> debug
    ...additionalContext
  };
}

/**
 * Run a function within a tenant context
 */
export function runWithTenantContextSync<T>(tenantContext: TenantContext, fn: () => T): T {
  return tenantContextStorage.run(tenantContext, fn);
}

/**
 * Run an async function within a tenant context
 */
export async function runWithTenantContextAsync<T>(tenantContext: TenantContext, fn: () => Promise<T>): Promise<T> {
  return tenantContextStorage.run(tenantContext, fn);
}

/**
 * Get the complete tenant context
 */
export function getTenantContext(): TenantContext | null {
  return currentContext || null;
}

/**
 * Set tenant context for the current async scope
 */
export function setTenantContext(context: Partial<TenantContext>): void {
  currentContext = {
    ...currentContext,
    ...context
  };
}

/**
 * Clear the current tenant context
 */
export function clearTenantContext(): void {
  currentContext = {
    tenantId: 'unknown',
    userId: 'anonymous'
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
export function setCurrentTenantContextWithProperties(
  tenantId: string,
  userId: string, // Make userId required
  options: { traceId?: string; requestId?: string; sessionId?: string } = {}
): void {
  const context: TenantContext = {
    tenantId,
    userId,
    requestId: options.requestId || generateRequestId(), // Add a default requestId
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
<<<<<<< HEAD
}

/**
 * Create a minimal default tenant context with required fields
 */
export function createDefaultTenantContext(tenantId: string): TenantContext {
  return {
    tenantId,
    userId: 'system',
    requestId: `auto-${Date.now()}`, // Generate a requestId to satisfy the interface
    traceId: undefined
  };
}

// Export a clear function for testing
export function clearTenantContext(): void {
  // AsyncLocalStorage doesn't have a direct way to clear context
  tenantContextStorage.enterWith(undefined as any);
}

// Add aliases for compatibility with existing tests
export const getCurrentTenantContext = getTenantContext;
export const setCurrentTenantContext = setTenantContext;
export { tenantContextStorage };
=======
}
>>>>>>> debug
