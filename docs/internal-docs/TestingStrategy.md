# Testing Strategy for Event-Sourced Applications

## Table of Contents

1. [Overview](#overview)
2. [Testing Layers](#testing-layers)
3. [Command Pattern Testing](#command-pattern-testing)
4. [Event Sourcing Testing](#event-sourcing-testing)
5. [Transaction Boundary Testing](#transaction-boundary-testing)
6. [Mock Strategy](#mock-strategy)
7. [Performance Testing](#performance-testing)
8. [Test Environment Management](#test-environment-management)
9. [Continuous Integration](#continuous-integration)
10. [Best Practices](#best-practices)

## Overview

This comprehensive testing strategy ensures robust behavior across all components of an event-sourced, command pattern-based application with particular emphasis on:

- Command execution correctness and event generation
- Transaction integrity across distributed operations
- Conflict detection and resolution validation
- Performance under high-volume event streams
- Tenant isolation enforcement

The strategy follows a pyramid approach with unit tests forming the foundation, integration tests validating component interactions, and end-to-end tests verifying complete workflows.

## Testing Layers

### Unit Tests

Unit tests verify individual components in isolation:

- Command handlers and validators
- Event handlers
- State projections
- Conflict resolution logic
- Vector timestamp operations

```typescript
// Example command handler unit test
test('should validate InsertTextCommand correctly', async () => {
  const validator = commandRegistry.getValidator('INSERT_TEXT');
  
  // Valid command
  const validCommand = {
    documentId: 'doc-123',
    position: 10,
    text: 'Hello world'
  };
  
  // Invalid command (missing text)
  const invalidCommand = {
    documentId: 'doc-123',
    position: 10
  };
  
  const validResult = await validator(validCommand);
  const invalidResult = await validator(invalidCommand);
  
  expect(validResult.valid).toBe(true);
  expect(invalidResult.valid).toBe(false);
  expect(invalidResult.reason).toContain('Text is required');
});
```

### Integration Tests

Integration tests verify interactions between components and system behavior:

```typescript
// Example integration test for command execution
test('should execute InsertTextCommand and generate TextInsertedEvent', async () => {
  const command = {
    documentId: 'doc-123',
    position: 10,
    text: 'Hello world'
  };
  
  const result = await commandRegistry.execute('INSERT_TEXT', command);
  
  // Verify event was created correctly
  expect(result.event).toBeDefined();
  expect(result.event.type).toBe('TEXT_INSERTED');
  expect(result.event.position).toBe(command.position);
  expect(result.event.text).toBe(command.text);
  
  // Verify event was stored
  const events = await eventStore.getEvents('doc-123');
  expect(events).toHaveLength(1);
  expect(events[0].type).toBe('TEXT_INSERTED');
  
  // Verify state was updated
  const document = await projectionCache.getDocument('doc-123');
  expect(document.content).toContain('Hello world');
});
```

### Command Pattern Testing

When testing command patterns, focus on:

```typescript
test('should reject DeleteTextCommand with invalid range', async () => {
  const command = {
    documentId: 'doc-123',
    position: 10,
    length: -5 // Invalid negative length
  };
  
  await expect(commandRegistry.execute('DELETE_TEXT', command))
    .rejects.toThrow(/Invalid length/);
});

test('should apply formatting to text range', async () => {
  // First insert some text
  await commandRegistry.execute('INSERT_TEXT', {
    documentId: 'doc-123',
    position: 0,
    text: 'Sample text for formatting'
  });
  
  // Then apply formatting
  await commandRegistry.execute('FORMAT_TEXT', {
    documentId: 'doc-123',
    position: 0,
    length: 6,
    formatting: { bold: true }
  });
  
  // Verify formatted content
  const document = await projectionCache.getDocument('doc-123');
  expect(document.content).toMatch(/<b>Sample<\/b> text for formatting/);
});
```

### Command Aggregation Testing

```typescript
test('should aggregate sequential insert commands', async () => {
  const aggregator = new CommandAggregator({
    maxBufferTimeMs: 100,
    maxBufferSize: 5,
    enableAdaptiveBuffering: false,
    commandSimilarityThreshold: 0.8,
    enableIntentDetection: false,
    maxMergeDistance: 10
  });
  
  // Sequential character inserts (like typing)
  await aggregator.bufferCommand({
    type: 'INSERT_TEXT',
    documentId: 'doc-123',
    position: 0,
    text: 'H'
  });
  
  await aggregator.bufferCommand({
    type: 'INSERT_TEXT',
    documentId: 'doc-123',
    position: 1,
    text: 'e'
  });
  
  await aggregator.bufferCommand({
    type: 'INSERT_TEXT',
    documentId: 'doc-123',
    position: 2,
    text: 'l'
  });
  
  // Force flush
  const commands = await aggregator.flush();
  
  // Should be aggregated into one command
  expect(commands).toHaveLength(1);
  expect(commands[0].text).toBe('Hel');
});
```

### Command Inversion Testing

```typescript
test('should correctly invert InsertTextCommand', async () => {
  const command = {
    type: 'INSERT_TEXT',
    documentId: 'doc-123',
    position: 5,
    text: 'Hello'
  };
  
  const invertedCommand = commandInverter.invert(command);
  
  expect(invertedCommand.type).toBe('DELETE_TEXT');
  expect(invertedCommand.documentId).toBe('doc-123');
  expect(invertedCommand.position).toBe(5);
  expect(invertedCommand.length).toBe(5); // Length of 'Hello'
});
```

## Event Sourcing Testing

### Schema Version Evolution

```typescript
test('should handle schema version evolution', async () => {
  // Register legacy event handler (v1)
  eventStore.registerEventHandler('TEXT_FORMATTED', 'v1', (state, event) => {
    // v1 handler implementation
    return updatedState;
  });
  
  // Register current event handler (v2)
  eventStore.registerEventHandler('TEXT_FORMATTED', 'v2', (state, event) => {
    // v2 handler implementation
    return updatedState;
  });
  
  // Create v1 event
  const v1Event = {
    id: 'evt-123',
    type: 'TEXT_FORMATTED',
    documentId: 'doc-123',
    position: 5,
    length: 5,
    bold: true,
    schemaVersion: 'v1'
  };
  
  // Create v2 event with additional formatting options
  const v2Event = {
    id: 'evt-124',
    type: 'TEXT_FORMATTED',
    documentId: 'doc-123',
    position: 10,
    length: 10,
    formatting: { bold: true, italic: true },
    schemaVersion: 'v2'
  };
  
  // Store both events
  await eventStore.appendEvent(v1Event);
  await eventStore.appendEvent(v2Event);
  
  // Rebuild state - should handle both versions
  const state = await eventStore.rebuildState('doc-123');
  
  // Verify both events were applied
  expect(state.content).toContain('<b>text</b>');
  expect(state.content).toContain('<b><i>more text</i></b>');
});
```

### Snapshot Testing

```typescript
test('should create and use snapshots', async () => {
  // Generate 100 events
  for (let i = 0; i < 100; i++) {
    await commandRegistry.execute('INSERT_TEXT', {
      documentId: 'doc-123',
      position: i,
      text: `${i}`
    });
  }
  
  // Force snapshot creation
  await eventStore.createSnapshot('doc-123');
  
  // Clear in-memory cache
  projectionCache.clear();
  
  // Fetch document - should use snapshot
  const startTime = performance.now();
  const document = await projectionCache.getDocument('doc-123');
  const duration = performance.now() - startTime;
  
  // Verify document content
  expect(document.content).toMatch(/0123456789/);
  
  // Verify snapshot was used (performance check)
  expect(duration).toBeLessThan(50); // Should be fast with snapshot
  
  // Verify only events after snapshot were fetched
  const eventsFetched = eventStore.getEventsFetchCount();
  expect(eventsFetched).toBeLessThan(10); // Should be small
});
```

## Transaction Boundary Testing

```typescript
test('should maintain transaction boundaries across services', async () => {
  const transactionManager = new TransactionManager();
  
  // Start a distributed transaction
  const tx = await transactionManager.beginDistributed(['content-service', 'metadata-service']);
  
  try {
    // Execute command in content service
    await contentService.execute('UPDATE_CONTENT', { /* params */ }, tx);
    
    // Execute command in metadata service
    await metadataService.execute('UPDATE_METADATA', { /* params */ }, tx);
    
    // Commit both or none
    await transactionManager.commitDistributed(tx);
  } catch (error) {
    // Roll back both services
    await transactionManager.rollbackDistributed(tx);
  }
  
  // Verify consistency across services
  const content = await contentService.getContent();
  const metadata = await metadataService.getMetadata();
  
  // Both should be updated or both should be unchanged
  expect(content.version).toBe(metadata.contentVersion);
});
```

### Event Ordering Testing

```typescript
test('should correctly order events with HLC timestamps', async () => {
  // Create HLC instances for two nodes
  const clock1 = new HybridLogicalClock('node1');
  const clock2 = new HybridLogicalClock('node2');
  
  // Generate timestamps
  const ts1 = clock1.now();
  const ts2 = clock2.now();
  
  // Process timestamp from other node
  clock1.update(ts2);
  
  // Generate new timestamp after processing
  const ts3 = clock1.now();
  
  // Verify causality
  expect(HybridLogicalClock.compare(ts1, ts3)).toBe(-1); // ts1 < ts3
  expect(HybridLogicalClock.compare(ts2, ts3)).toBe(-1); // ts2 < ts3
});
```

### Tenant Isolation Testing

```typescript
// Mock tenant context
const mockTenantContext = (tenantId: string, userId: string) => {
  const tenantContext = { tenantId, userId };
  (getTenantContext as jest.Mock).mockReturnValue(tenantContext);
};

// Clear mock tenant context
const clearTenantContext = () => {
  (getTenantContext as jest.Mock).mockReturnValue(undefined);
};

// Usage in tests
test('should respect tenant boundaries', async () => {
  mockTenantContext('tenant-1', 'user-1');
  
  // Test operations for tenant-1
  await commandRegistry.execute('INSERT_TEXT', {
    documentId: 'doc-123',
    position: 0,
    text: 'Tenant 1 content'
  });
  
  // Switch tenant context
  mockTenantContext('tenant-2', 'user-2');
  
  // Tenant-2 should not see tenant-1's document
  await expect(projectionCache.getDocument('doc-123'))
    .rejects.toThrow(/not found/);
  
  clearTenantContext();
});
```

### Performance Testing

```typescript
test('should handle high command throughput', async () => {
  const commandCount = 1000;
  const startTime = performance.now();
  
  // Execute many commands in sequence
  for (let i = 0; i < commandCount; i++) {
    await commandRegistry.execute('INSERT_TEXT', {
      documentId: 'doc-123',
      position: i,
      text: `${i}`
    });
  }
  
  const duration = performance.now() - startTime;
  const throughput = commandCount / (duration / 1000); // commands per second
  
  expect(throughput).toBeGreaterThan(100); // At least 100 commands/second
});
```

## Mock Strategy

For effective testing of complex applications, proper mocking is essential:

```typescript
// Example Redis mock setup
jest.mock('redis', () => {
  const mockClient = {
    connect: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(),
    set: jest.fn().mockResolvedValue('OK'),
    incr: jest.fn(),
    decr: jest.fn(),
    expire: jest.fn().mockResolvedValue(1),
    hGet: jest.fn(),
    hSet: jest.fn(),
    // Other necessary methods
  };
  
  return {
    createClient: jest.fn().mockImplementation(() => mockClient)
  };
});

// Example Prisma mock
jest.mock('../prisma/client', () => ({
  prisma: {
    document: {
      create: jest.fn().mockResolvedValue({ id: 'mock-doc-id' }),
      findUnique: jest.fn().mockResolvedValue({ /* mock document */ }),
      update: jest.fn().mockResolvedValue({ /* mock document */ })
    },
    event: {
      create: jest.fn().mockResolvedValue({ id: 'mock-event-id' }),
      findMany: jest.fn().mockResolvedValue([/* mock events */])
    }
    // Other necessary models
  }
}));
```

## Performance Testing

Performance testing ensures the system can handle high loads and large data volumes efficiently:

- **Load testing**: Verify behavior under expected load
- **Stress testing**: Find breaking points under extreme load
- **Scalability testing**: Evaluate performance as system scales
- **Endurance testing**: Assess stability over extended periods

## Test Environment Management

Proper management of test environments is crucial for reliable, repeatable tests:

```typescript
beforeAll(async () => {
  // Set up test database
  await prisma.$executeRaw`CREATE DATABASE test_db`;
  await prisma.$connect();
  await prisma.$runCommandRaw({ migrate: 'up' });
});

afterAll(async () => {
  // Clean up test database
  await prisma.$disconnect();
  await prisma.$executeRaw`DROP DATABASE test_db`;
});

beforeEach(async () => {
  // Wrap each test in a transaction that will be rolled back
  await prisma.$transaction(async (tx) => {
    // Set transaction client for this test
    prismaClient = tx;
    // Run test setup
  });
});

afterEach(async () => {
  // Transaction automatically rolled back
});
```

## Continuous Integration

CI is essential for maintaining code quality and preventing regressions:

```yaml
# Example GitHub Actions workflow
name: Test Suite

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      redis:
        image: redis
        ports:
          - 6379:6379
      postgres:
        image: postgres
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    
    steps:
      - uses: actions/checkout@v2
      
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run tests
        run: npm test
      
      - name: Run performance tests
        run: npm run test:performance
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v1
```

## Best Practices

Adherence to these best practices ensures test reliability and maintainability:

- **Write clear, focused tests**: Each test should verify a single behavior
- **Use descriptive names**: Test names should describe expected behavior
- **Maintain isolation**: Tests should not depend on each other
- **Implement proper setup/teardown**: Clean environment for each test
- **Optimize test speed**: Fast tests enable rapid feedback cycles
- **Implement CI/CD pipeline**: Automate testing on every code change
- **Use transaction boundaries**: Roll back after each test for database cleanliness
- **Implement proper mocking**: Isolate the system under test
- **Regularly review test coverage**: Identify and address coverage gaps
- **Keep tests maintainable**: Refactor tests as application evolves

By implementing this comprehensive testing strategy, you'll ensure that your event-sourced application maintains high quality standards, remains resilient under load, and adapts well to evolving requirements.