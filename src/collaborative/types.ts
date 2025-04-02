/**
 * Interface representing an operation with version information for conflict detection
 */
export interface VersionedOperation {
  /**
   * Unique identifier for the operation
   */
  id?: string;
  
  /**
   * The document this operation applies to
   */
  documentId: string;
  
  /**
   * The user who created the operation
   */
  userId: string;
  
  /**
   * Version number of the document when this operation was created
   */
  version: number;
  
  /**
   * Timestamp when the operation was created
   */
  timestamp: number;
  
  /**
   * Position in the document where the operation starts
   */
  position?: number;
  
  /**
   * Length of text affected by the operation
   */
  length?: number;
  
  /**
   * New text to be inserted (for insert operations)
   */
  text?: string;
  
  /**
   * Type of operation being performed
   */
  type?: 'insert' | 'delete' | 'replace' | 'format' | 'move' | 'structure' | 'composite';
  
  /**
   * Client ID that created this operation (used in testing)
   */
  clientId?: string;
  
  /**
   * Vector clock for concurrent operations detection
   */
  vectorClock?: Record<string, number> | { toRecord(): Record<string, number> };
  
  /**
   * Nested operation details (used in some test versions)
   */
  operation?: {
    type: string;
    position: number;
    length?: number;
    content?: string;
    text?: string;
    attributes?: Record<string, any>;
  };
  
  /**
   * Additional metadata for the operation
   */
  metadata?: Record<string, any>;
}

/**
 * Result of a conflict detection operation
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: OperationRelationship;
  conflictType?: ConflictType;
  affectedRegion?: { start: number; end: number; };
  confidenceScore?: number;
  description?: string;
}

/**
 * Types of conflicts that can occur between operations
 */
export enum ConflictType {
  TEXT_EDIT = 'TEXT_EDIT',
  FORMAT = 'FORMAT',
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  STRUCTURAL = 'STRUCTURAL',
  MOVE_MODIFIED = 'MOVE_MODIFIED',
  NONE = 'NONE'
}

/**
 * Possible relationships between operations
 */
export type OperationRelationship = 'before' | 'after' | 'concurrent' | 'identical';

/**
 * A conflict between operations
 */
export interface Conflict {
  operations: VersionedOperation[];
  type: ConflictType;
  region: { start: number; end: number };
  resolutionStrategy?: string;
}

/**
 * Interface for a conflict resolution provider
 */
export interface ConflictResolutionProvider {
  resolveConflict(conflict: Conflict): Promise<VersionedOperation>;
  suggestResolutionStrategy(conflict: Conflict): Promise<string>;
}