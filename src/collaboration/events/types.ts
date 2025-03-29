/**
 * Base event interface for document operations
 */
export interface BaseEvent {
  id: string;
  documentId?: string;  // Optional since some tests use aggregateId
  userId: string;
  type: string;
  timestamp: number | string;
  vectorClock?: Record<string, number>;
  payload?: any;
  
  // Support for backward compatibility with tests
  aggregateId?: string;  // Used instead of documentId in many tests
  version?: number;
  tenantId?: string;
  metadata?: Record<string, any>;
}

// Ensure correct validation happens at runtime
export function validateBaseEvent(event: BaseEvent): BaseEvent {
  if (!event.documentId && !event.aggregateId) {
    throw new Error('Event must have either documentId or aggregateId');
  }
  
  // If aggregateId is present but documentId is not, copy it
  if (!event.documentId && event.aggregateId) {
    return {
      ...event,
      documentId: event.aggregateId
    };
  }
  
  return event;
}

/**
 * Document event with position information
 */
export interface DocumentEvent extends BaseEvent {
  // Position properties - different events use different patterns
  position?: number;
  startPosition?: number;
  endPosition?: number;
  
  // Content properties
  content?: string;
  text?: string;
  length?: number;
  
  // Format properties
  attributes?: Record<string, any>;
  
  // Operation details
  operation?: {
    type: string;
    position: number;
    content?: string;
    length?: number;
    attributes?: Record<string, any>;
  };
}

export interface TextInsertedEvent extends DocumentEvent {
  type: 'TEXT_INSERTED';
  position: number;
  text: string;
}

export interface TextDeletedEvent extends DocumentEvent {
  type: 'TEXT_DELETED';
  position: number;
  length: number;
  deletedText: string;
}

export interface TextReplacedEvent extends DocumentEvent {
  type: 'TEXT_REPLACED';
  startPosition: number;
  endPosition: number;
  newText: string;
  oldText: string;
}

export interface TextFormattedEvent extends DocumentEvent {
  type: 'TEXT_FORMATTED';
  startPosition: number;
  endPosition: number;
  formatting: Record<string, any>;
}

export interface BlockMovedEvent extends DocumentEvent {
  type: 'BLOCK_MOVED';
  startPosition: number;
  endPosition: number;
  targetPosition: number;
}

export interface BlockInsertedEvent extends DocumentEvent {
  type: 'BLOCK_INSERTED';
  position: number;
  blockType: string;
  blockContent: any;
}

export interface MetadataUpdatedEvent extends DocumentEvent {
  type: 'METADATA_UPDATED';
  key: string;
  value: any;
  previousValue?: any;
}