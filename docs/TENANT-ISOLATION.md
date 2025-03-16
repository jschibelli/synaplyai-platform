# Tenant Isolation Architecture

## Overview

The AI Content Creation Platform implements a robust multi-tenant isolation architecture to ensure complete data separation between tenants. This document outlines the approach, implementation details, and best practices for maintaining strict tenant boundaries.

## Core Principles

1. **Complete Data Isolation**: No tenant can access data belonging to another tenant
2. **Context Propagation**: Tenant context is preserved across all asynchronous operations
3. **Default Denial**: Access is denied by default if tenant context is missing
4. **Automated Enforcement**: Tenant filtering is applied automatically at the data access layer

## Implementation Architecture

### AsyncLocalStorage-Based Context

The isolation architecture uses Node.js AsyncLocalStorage to maintain tenant context throughout request lifecycles:

```typescript
import { AsyncLocalStorage } from 'async_hooks';

interface TenantContext {
  tenantId: string;
  userId?: string;
  features?: string[];
}

// Create a global tenant context storage
export const tenantContextStorage = new AsyncLocalStorage<TenantContext>();

// Get the current tenant ID from the context
export function getCurrentTenantId(): string | undefined {
  const context = tenantContextStorage.getStore();
  return context?.tenantId;
}

// Create middleware to set tenant context
export function withTenantContext(handler) {
  return async (req, res) => {
    const tenantId = getTenantIdFromRequest(req);
    
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context missing' });
    }
    
    return tenantContextStorage.run({ tenantId }, () => {
      return handler(req, res);
    });
  };
}
```

### Prisma Middleware for Automatic Filtering

Tenant isolation is enforced at the database level using Prisma middleware:

```typescript
import { PrismaClient } from '@prisma/client';
import { getCurrentTenantId } from '../lib/tenant-context';

const prisma = new PrismaClient();

// Add middleware to automatically filter by tenant
prisma.$use(async (params, next) => {
  // Skip middleware for non-CRUD operations
  if (!['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete'].includes(params.action)) {
    return next(params);
  }
  
  // Get current tenant ID
  const tenantId = getCurrentTenantId();
  
  // If no tenant ID, reject the operation
  if (!tenantId) {
    throw new Error('Tenant context missing. Operation rejected.');
  }
  
  // Skip for models that don't have tenantId
  const modelHasTenantId = (params.model === 'User' || 
                           params.model === 'Document' || 
                           params.model === 'ComplianceLog');
  
  if (!modelHasTenantId) {
    return next(params);
  }
  
  // For findMany, add tenantId filter
  if (params.action === 'findMany') {
    params.args.where = {
      ...params.args.where,
      tenantId,
    };
  }
  
  // For create, ensure tenantId is set
  if (params.action === 'create') {
    params.args.data = {
      ...params.args.data,
      tenantId,
    };
  }
  
  // For update/delete, ensure operation only affects current tenant's data
  if (['update', 'delete'].includes(params.action)) {
    params.args.where = {
      ...params.args.where,
      tenantId,
    };
  }
  
  // For findUnique/findFirst, verify tenant after the operation
  if (['findUnique', 'findFirst'].includes(params.action)) {
    const result = await next(params);
    if (result && result.tenantId !== tenantId) {
      return null; // Return null if attempting to access another tenant's data
    }
    return result;
  }
  
  return next(params);
});

export default prisma;
```

## Tenant Context Propagation

### Request Lifecycle

1. **API Routes**: Wrapped with `withTenantContext` middleware
2. **Authentication**: Tenant ID extracted from JWT or session
3. **Database Queries**: Automatically filtered by tenant
4. **External Services**: Tenant context included in requests
5. **Logging**: Tenant ID included in all log entries

### Async Operations

Special care is taken to maintain tenant context across asynchronous boundaries:

```typescript
// Background job processing with tenant context
export async function processJobWithTenantContext(job, tenantId) {
  return tenantContextStorage.run({ tenantId }, async () => {
    // Job processing code here
    const documents = await prisma.document.findMany();
    // Processing continues with tenant context...
  });
}

// For event handlers
emitter.on('someEvent', (data) => {
  const { tenantId } = data;
  tenantContextStorage.run({ tenantId }, () => {
    // Event handling with tenant context
  });
});
```

## Database Schema Support

All multi-tenant tables include a `tenantId` column and appropriate indexes:

```prisma
model User {
  id             String    @id @default(cuid())
  email          String?   @unique
  name           String?
  tenantId       String
  // Other fields...
  
  @@index([tenantId])
}

model Document {
  id        String   @id @default(cuid())
  title     String
  content   String   @db.Text
  tenantId  String
  // Other fields...
  
  @@index([tenantId])
}
```

## Security Measures

### Preventing Tenant Context Manipulation

1. **Immutable Context**: Once set, tenant context cannot be modified within a request lifecycle
2. **Validation**: Tenant IDs are validated against the authenticated user's tenant
3. **Error Boundaries**: Operations fail securely if tenant context is missing

### Audit and Monitoring

1. **Access Logs**: All cross-tenant access attempts are logged
2. **Compliance Events**: Tenant context changes are recorded in the compliance log
3. **Anomaly Detection**: Unusual patterns of tenant access trigger alerts

## Testing Tenant Isolation

Comprehensive tests verify tenant isolation:

```typescript
// Example test verifying tenant isolation
test('User cannot access documents from another tenant', async () => {
  // Create documents for tenant1
  await tenantContextStorage.run({ tenantId: 'tenant1' }, async () => {
    await prisma.document.create({
      data: { title: 'Tenant 1 Document', content: 'Secret data' }
    });
  });
  
  // Try to access from tenant2 context
  const documents = await tenantContextStorage.run({ tenantId: 'tenant2' }, async () => {
    return prisma.document.findMany();
  });
  
  // Verify tenant2 cannot see tenant1's documents
  expect(documents.length).toBe(0);
});
```

## Best Practices

1. **Always Use Middleware**: Wrap all API routes with tenant context middleware
2. **Verify Tenant Context**: Add assertions to ensure tenant context exists before database operations
3. **Test Isolation**: Write specific tests for tenant boundary enforcement
4. **Error Handling**: Provide clear error messages when tenant context is missing
5. **Audit Logging**: Log all tenant context operations for compliance purposes

## Common Pitfalls

1. **Third-Party Libraries**: Ensure third-party libraries respect tenant context
2. **Nested Async Operations**: Watch for tenant context loss in nested async functions
3. **WebSockets**: Explicitly pass tenant context in WebSocket connections
4. **Background Jobs**: Ensure background jobs carry the correct tenant context
5. **Direct SQL**: Avoid direct SQL queries that might bypass tenant filtering

## Next Steps

1. **Enhanced Validation**: Implement additional validation for tenant context
2. **Performance Optimization**: Fine-tune tenant filtering for high-volume operations
3. **Cross-Tenant Features**: Develop secure patterns for legitimate cross-tenant functionality
4. **Tenant-Specific Configurations**: Implement tenant-specific feature flags and settings