# Command Pattern Architecture

This document provides detailed information about the implementation of the Command Pattern in the AI Content Creation Platform, specifically for the document editing functionality.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Key Components](#key-components)
4. [Command Lifecycle](#command-lifecycle)
5. [Transaction Boundaries](#transaction-boundaries)
6. [UML Diagram](#uml-diagram)
7. [Extending with New Commands](#extending-with-new-commands)
8. [Best Practices](#best-practices)
9. [Performance Considerations](#performance-considerations)
10. [Integration Points](#integration-points)

## Overview

The Command Pattern implementation enables a robust, event-sourced document editing system with strong typing, validation, and transactional integrity. All document operations are represented as commands that are validated, executed, and stored as immutable events, enabling features like:

- Complete audit history of document modifications
- Undo/redo functionality through command inversion
- Collaborative editing with conflict resolution
- Transaction boundaries for atomic operations
- Type-safe command handling with validation

## Architecture

The command pattern architecture follows these key principles:

1. **Command/Query Separation**: All state-changing operations are represented as commands
2. **Immutable Events**: Commands produce immutable events that are stored persistently
3. **Transaction Boundaries**: Commands execute within transaction boundaries
4. **Validation**: Commands are validated before execution
5. **Event Sourcing**: Document state is reconstructed by replaying events

### Workflow

```
[User Action] → [Command] → [Validation] → [Execution] → [Event] → [State Update]
```

## Key Components

### CommandRegistry

The central registry manages command handlers, validation, and execution:

- Registers command handlers with validation rules
- Executes commands within transaction boundaries
- Dispatches events to the event store
- Supports batch command execution

### Command Types

Commands represent intent to change state and include:

- **INSERT_TEXT**: Insert text at a specific position
- **DELETE_TEXT**: Delete text from a position with specified length
- **FORMAT_TEXT**: Apply formatting attributes to a text range

### Command Handlers

Handlers contain business logic to:
- Validate command input
- Execute the command
- Generate appropriate events

### Event Store

Stores events with:
- Schema versioning for backward compatibility
- Tenant isolation for security
- Adaptive snapshotting for performance

### Transaction Manager

Manages transaction boundaries with:
- Hybrid logical clocks for distributed ordering
- Transaction isolation to prevent recursive updates
- Tenant-specific transaction boundaries

### Command Aggregator

Optimizes command execution by:
- Buffering similar commands
- Merging compatible operations
- Adaptive buffer sizing based on system load

## Command Lifecycle

1. **Creation**: Client code creates a typed command object
2. **Registration**: Command type is registered with handler and validator
3. **Submission**: Command is sent to the registry for execution
4. **Validation**: Command validator checks for correctness
5. **Execution**: Handler executes the command within a transaction
6. **Event Generation**: Command handler generates appropriate event(s)
7. **Storage**: Event is stored in the event store
8. **Completion**: Promise resolves with command result

## Transaction Boundaries

Commands execute within transaction boundaries managed by the `TransactionManager`:

- Each command starts a new transaction or joins an existing one
- Transactions use hybrid logical clocks for temporal ordering
- Failed validations abort the transaction
- Batch commands execute in a single transaction

## UML Diagram

```ascii
┌───────────────────┐     executes     ┌───────────────────┐
│                   │─────────────────>│                   │
│   Client Code     │                  │  CommandRegistry  │
│                   │<─────────────────│                   │
└───────────────────┘    returns       └─────────┬─────────┘
                                               │
                           ┌───────────────────┘
                           │  registers/executes
                           ▼
┌───────────────────┐     uses        ┌───────────────────┐
│                   │<───────────────>│                   │
│  CommandHandler   │                 │ TransactionManager│
│                   │                 │                   │
└─────────┬─────────┘                 └─────────┬─────────┘
          │                                     │
          │ produces                            │ manages
          ▼                                     ▼
┌───────────────────┐     stored in    ┌───────────────────┐
│                   │─────────────────>│                   │
│      Event        │                  │    EventStore     │
│                   │                  │                   │
└───────────────────┘                  └───────────────────┘
          │
          │ applied to
          ▼
┌───────────────────┐     cached in    ┌───────────────────┐
│                   │─────────────────>│                   │
│    Projection     │                  │  ProjectionCache  │
│                   │<─────────────────│                   │
└───────────────────┘    retrieved     └───────────────────┘
```

## Extending with New Commands

### Step 1: Define Command Interface

```typescript
interface ReplaceTextCommand extends DocumentCommand {
  startPosition: number;
  endPosition: number;
  newText: string;
}
```

### Step 2: Define Event Interface

```typescript
interface TextReplacedEvent extends Partial<BaseEvent> {
  documentId: string;
  startPosition: number;
  endPosition: number;
  oldText: string;
  newText: string;
  aggregateVersion: number;
}
```

### Step 3: Implement and Register Command Handler

```typescript
// Register REPLACE_TEXT command
registry.register<ReplaceTextCommand, TextReplacedEvent>(
  'REPLACE_TEXT',
  async (command) => {
    // Get the current document state to extract the text being replaced
    const document = await documentRepository.get(command.documentId);
    const oldText = document.content.substring(command.startPosition, command.endPosition);
    
    return {
      event: {
        documentId: command.documentId,
        startPosition: command.startPosition,
        endPosition: command.endPosition,
        oldText,
        newText: command.newText,
        aggregateVersion: document.version + 1
      },
      metadata: {
        executionTimeMs: 0,
        validated: false,
        transactionId: ''
      }
    };
  },
  {
    validator: async (command) => {
      if (!command.documentId) {
        return { valid: false, reason: 'Document ID is required' };
      }
      if (typeof command.startPosition !== 'number' || command.startPosition < 0) {
        return { valid: false, reason: 'Start position must be a non-negative number' };
      }
      if (typeof command.endPosition !== 'number' || command.endPosition <= command.startPosition) {
        return { valid: false, reason: 'End position must be greater than start position' };
      }
      if (!command.newText && command.newText !== '') {
        return { valid: false, reason: 'New text is required (can be empty string)' };
      }
      return { valid: true };
    },
    schemaVersion: {
      version: '1.0',
      schemaHash: createHash('sha256').update('TextReplacedEvent-1.0').digest('hex')
    }
  }
);
```

### Step 4: Handle the Event in Projections

```typescript
eventStore.registerEventHandler<DocumentState>('REPLACE_TEXT', (state, event) => {
  const typedEvent = event as TextReplacedEvent;
  const content = state.content;
  
  // Replace the content
  const newContent = 
    content.substring(0, typedEvent.startPosition) + 
    typedEvent.newText + 
    content.substring(typedEvent.endPosition);
  
  return {
    ...state,
    content: newContent,
    version: typedEvent.aggregateVersion
  };
});
```

## Best Practices

1. **Command Validation**: Always validate commands before execution
2. **Idempotency**: Design commands to be idempotent whenever possible
3. **Transaction Scoping**: Keep transactions as short as possible
4. **Command Aggregation**: Use the `CommandAggregator` for high-frequency operations
5. **Schema Evolution**: Version command and event schemas for forward compatibility
6. **Error Handling**: Provide clear error messages for validation failures
7. **Command Documentation**: Document commands with JSDoc annotations
8. **Testing**: Write unit tests for command validation and execution

## Performance Considerations

- **Command Aggregation**: High-frequency editing operations can be aggregated
- **Snapshotting**: Use the EventStore's adaptive snapshotting for large documents
- **Projection Caching**: Use the ProjectionCache for frequently accessed documents
- **Batch Operations**: Use batch command execution for multi-step operations

## Integration Points

The Command Pattern integrates with several systems:

- **EventStore**: Persists events produced by commands
- **TransactionManager**: Manages transaction boundaries
- **ProjectionCache**: Caches document projections for efficient retrieval
- **ConflictResolver**: Resolves conflicts in collaborative editing
- **ComplianceLogger**: Logs command execution for audit purposes
- **MetricsCollector**: Measures command execution performance

These integration points ensure that the Command Pattern fits seamlessly into the broader architectural framework of the AI Content Creation Platform.
