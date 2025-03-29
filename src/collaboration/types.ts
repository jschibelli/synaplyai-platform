/**
 * Represents a versioned operation that includes timestamp and user metadata
 */
export interface VersionedOperation {
  // Core properties
  id?: string;
  userId?: string;
  clientId?: string;
  documentId?: string;
  timestamp: number;
  
  // Direct operation fields (old style)
  type?: 'insert' | 'delete' | 'replace' | 'format' | 'move';
  position?: number;
  length?: number;
  text?: string;
  format?: Record<string, any>;
  
  // Nested operation (new style)
  operation?: {
    type: string;
    position: number;
    content?: string;
    length?: number;
    attributes?: Record<string, any>;
    [key: string]: any;
  };
  
  // Vector clock
  vectorClock: Record<string, number>;
}

/**
 * Result of conflict detection between operations
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: 'before' | 'after' | 'concurrent' | 'same';
  conflictType?: ConflictType;
  confidenceScore?: number;
  affectedRegion?: {
    start: number;
    end: number;
  };
}

/**
 * Defines types of conflicts that can be detected
 */
export enum ConflictType {
  TEXT_EDIT = 'TEXT_EDIT',
  FORMAT = 'FORMAT',
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  STRUCTURAL = 'STRUCTURAL',
  MOVE_MODIFIED = 'MOVE_MODIFIED'
}

/**
 * Extended conflict type with additional properties needed by resolver
 */
export interface ExtendedConflict extends ConflictDetectionResult {
  id: string;
  localEvent: any; // Use your BaseEvent type
  remoteEvent: any; // Use your BaseEvent type
  local?: VersionedOperation;
  remote?: VersionedOperation;
}