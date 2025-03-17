# SynaplyAI: Enterprise Multi-Tenant AI Content Platform

## Overview

SynaplyAI is a scalable, multi-tenant AI content creation platform designed for enterprise environments, with robust tenant isolation, comprehensive usage tracking, and collaborative editing capabilities. The platform empowers organizations to leverage AI models while maintaining strict governance, compliance, and performance monitoring.

## Key Architectural Features

### Tenant Isolation Architecture

- **Complete Data Separation**: AsyncLocalStorage-based context propagation ensures tenant boundaries across all operations
- **Automated Enforcement**: Prisma middleware for database-level tenant filtering
- **Contextual Security**: Request-scoped tenant identifiers with access validation

### Usage Tracking System

- **Token-Level Monitoring**: Precise tracking of AI model consumption
- **Tiered Subscription Management**: Differentiated access and limits by subscription level
- **Multi-Model Support**: Compatible with both OpenAI and Anthropic models

### Collaborative Editing Framework

- **Event Sourcing Architecture**: Immutable event history with snapshot optimization
- **Command Pattern Implementation**: Type-safe command handling with validation
- **Conflict Resolution**: Advanced detection and resolution of concurrent edits
- **Real-time Synchronization**: Cursor tracking and document state management

### Compliance & Governance Framework

- **Immutable Audit Trail**: Partitioned, tamper-proof compliance logging
- **Content Filtering**: Multi-stage pipeline with progressive filtering sophistication
- **Circuit Breaker Pattern**: Tenant-aware resilience with adaptive thresholds

## Technical Stack

- **Frontend**: Next.js, TypeScript, React
- **Backend**: Node.js, Express
- **Database**: PostgreSQL with tenant partitioning
- **Real-time**: Socket.IO for collaborative features
- **Caching**: Redis for metrics and circuit breaker state
- **ORM**: Prisma with tenant middleware

## Architecture Diagram

```
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│                   │     │                   │     │                   │
│  Client Interface │────▶│  Command Registry │────▶│    Event Store    │
│                   │     │                   │     │                   │
└───────────────────┘     └───────────────────┘     └─────────┬─────────┘
                                                              │
                                                              ▼
┌───────────────────┐     ┌───────────────────┐     ┌───────────────────┐
│                   │     │                   │     │                   │
│  Real-time Sync   │◀───▶│  Document State   │◀────│   Event Handlers  │
│                   │     │                   │     │                   │
└───────────────────┘     └───────────────────┘     └───────────────────┘
        ▲                                                    ▲
        │                                                    │
        │                 ┌───────────────────┐             │
        │                 │                   │             │
        └────────────────│ Tenant Context    │─────────────┘
                          │                   │
                          └───────────────────┘
```

## Core Subsystems

### Tenant Isolation

The platform enforces tenant isolation through several mechanisms:

```typescript
// Database-level tenant filtering with Prisma middleware
prisma.$use(async (params, next) => {
  // Get current tenant ID from context
  const tenantId = getCurrentTenantId();
  
  // Skip for non-CRUD operations
  if (!['findMany', 'findUnique', 'findFirst', 'create', 'update', 'delete'].includes(params.action)) {
    return next(params);
  }
  
  // Apply tenant filter
  if (params.action === 'findMany') {
    params.args.where = {
      ...params.args.where,
      tenantId,
    };
  }
  
  // Handle other operations...
  return next(params);
});
```

### Event Sourcing & Command Pattern

The platform uses an event sourcing architecture with command pattern for document operations:

```typescript
// Command execution with transaction boundaries
async executeCommand(command) {
  return this.transactionManager.executeInTransaction(async (transaction) => {
    // Generate events from command
    const events = await this.commandHandler.handle(command);
    
    // Store events in EventStore
    for (const event of events) {
      await this.eventStore.store(event, transaction);
    }
    
    // Return command result
    return { success: true, events };
  });
}
```

### Usage Tracking

The platform includes comprehensive usage tracking:

```typescript
// Track token usage with tenant isolation
async trackTokenUsage(tenantId, modelId, requestTokens, responseTokens) {
  // Record usage in Redis time buckets
  const dayKey = `usage:${tenantId}:${modelId}:${formatDate(new Date())}`;
  const monthKey = `usage:${tenantId}:${modelId}:${formatMonth(new Date())}`;
  
  // Use Redis pipeline for atomic operations
  const pipeline = this.redisClient.pipeline();
  pipeline.incrby(`${dayKey}:request`, requestTokens);
  pipeline.incrby(`${dayKey}:response`, responseTokens);
  pipeline.incrby(`${monthKey}:request`, requestTokens);
  pipeline.incrby(`${monthKey}:response`, responseTokens);
  
  // Execute pipeline
  await pipeline.exec();
  
  // Also store in database for permanence
  await this.prisma.userUsage.create({
    data: {
      tenantId,
      modelId,
      requestTokens,
      responseTokens,
      date: new Date()
    }
  });
}
```

## Getting Started

### Prerequisites

- Node.js v18+
- PostgreSQL 14+
- Redis 6+

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-org/synaplyai.git
   cd synaplyai
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env.local
   # Edit .env.local with your configuration
   ```

4. Run database migrations:
   ```bash
   npx prisma migrate dev
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

## Architecture Decision Records

### Tenant Isolation Strategy

**Decision**: Use AsyncLocalStorage-based context propagation with Prisma middleware

**Rationale**: This approach provides:
- Automatic tenant filtering at the database level
- Persistence of tenant context across async boundaries
- Clean separation without code duplication
- Built-in security through default denial when context is missing

### Event Sourcing Implementation

**Decision**: Implement event sourcing with adaptive snapshotting

**Rationale**:
- Complete audit trail of all document changes
- Point-in-time reconstruction capabilities
- Optimized performance through adaptive snapshots
- Support for conflict detection and resolution

### Circuit Breaker Pattern

**Decision**: Use tenant-aware circuit breakers with Redis state storage

**Rationale**:
- Prevents cascade failures while maintaining tenant isolation
- Shared state across distributed systems
- Adaptive thresholds based on tenant-specific patterns
- Self-healing through half-open state testing

## Development Guidelines

### Tenant Context Propagation

Always ensure tenant context is properly propagated:

```typescript
// Using tenant context in API routes
export default async function handler(req, res) {
  // Extract tenant ID from request
  const tenantId = extractTenantId(req);
  
  // Run with tenant context
  return tenantContextStorage.run({ tenantId }, async () => {
    // All operations within this function have tenant context
    const data = await prisma.documents.findMany();
    return res.status(200).json(data);
  });
}
```

### Command Validation

Implement proper validation for all commands:

```typescript
// Command validation
function validateCommand(command) {
  // Schema validation
  if (!command.documentId) {
    return { valid: false, reason: 'Document ID is required' };
  }
  
  // Business rule validation
  if (command.type === 'DELETE_TEXT' && command.length <= 0) {
    return { valid: false, reason: 'Delete length must be positive' };
  }
  
  return { valid: true };
}
```

## Performance Considerations

- **Adaptive Snapshotting**: Creates snapshots based on document size and activity
- **Redis-Based Metrics**: Time-bucketed metrics with automatic roll-ups
- **Command Aggregation**: Batches similar commands to reduce network overhead
- **Circuit Breaker Thresholds**: Adapts based on service reliability patterns

## Security Best Practices

- **Tenant ID Validation**: Always validate tenant ID matches authenticated user
- **Command Authorization**: Verify permissions before execution
- **Content Filtering**: Multi-stage pipeline to prevent policy violations
- **Immutable Audit Logs**: Tamper-proof evidence of system activity

## Testing Strategy

- **Tenant Isolation Tests**: Verify data separation between tenants
- **Event Replay Tests**: Confirm correct state reconstruction
- **Conflict Resolution Tests**: Validate handling of concurrent edits
- **Performance Tests**: Ensure system scales under load

## Deployment Architecture

The platform supports flexible deployment options:

- **Kubernetes**: Container orchestration with tenant-aware scaling
- **Serverless**: Function-based deployment with context preservation
- **Traditional**: VM-based deployment with service clustering

## Roadmap

See [Project Plan](./docs/project-plan.md) for detailed development milestones.

## License

This project is licensed under the MIT License - see the [LICENSE](./LICENSE) file for details.

## Contributors

- John Schibelli (Project Lead)

---

This README provides a high-level overview of the architecture and implementation strategy. For detailed documentation, please refer to the specific subsystem documentation in the `docs/` directory.