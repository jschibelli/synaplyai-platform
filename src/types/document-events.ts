// The key issue is that 'operation' needs to support both string and object formats

/**
 * Represents a structured operation for document editing
 */
export interface StructuredOperation {
  type: string;
  position: number;
  content?: string;
  length?: number;
  text?: string; // Added to support tests that use 'text' property
  attributes?: Record<string, any>;
}

/**
 * Union type for document operations to support both string and structured formats
 */
export type DocumentOperation = string | StructuredOperation;

/**
 * Represents a document event with standardized properties
 */
export interface DocumentEvent {
  id: string;
  documentId: string;
  userId: string;
  operation: DocumentOperation;
  timestamp: number;
  version: number;
  position?: number;
  type?: string;
  metadata?: Record<string, any>;
  vectorClock?: Record<string, number>;
  clientId?: string; // Added to support tests that use clientId
}

/**
 * Represents an operation with version tracking
 */
export interface VersionedOperation {
  id?: string;
  documentId: string;
  userId: string;
  operation: DocumentOperation;
  timestamp: number;
  version: number;
  position?: number;
  type?: string;
  metadata?: Record<string, any>;
  vectorClock?: Record<string, number>;
  clientId?: string; // Added to support tests that use clientId
  text?: string; // Added to support tests that use text directly
}

/**
 * Result type for conflict detection
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: 'before' | 'after' | 'concurrent' | 'same';
  conflictType?: string;
  confidenceScore?: number;
}

/**
 * Helper function to convert a VersionedOperation to a DocumentEvent
 */
export function toDocumentEvent(op: VersionedOperation): DocumentEvent {
  return {
    id: op.id || `event-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    documentId: op.documentId,
    userId: op.userId,
    operation: op.operation,
    timestamp: op.timestamp,
    version: op.version,
    position: op.position,
    type: op.type,
    metadata: op.metadata,
    vectorClock: op.vectorClock,
    clientId: op.clientId // Preserve clientId when converting
  };
}