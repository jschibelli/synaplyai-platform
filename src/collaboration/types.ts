/**
 * Represents a versioned operation that includes timestamp and user metadata
 */
export interface VersionedOperation {
  id: string;
  userId: string;
  documentId: string;
  type: 'insert' | 'delete' | 'replace' | 'format';
  position: number;
  length?: number;
  text?: string;
  format?: Record<string, any>;
  timestamp: number;
  vectorClock?: Record<string, number>;
}

/**
 * Result of conflict detection between operations
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: 'before' | 'after' | 'concurrent' | 'same';
  conflictType?: 'TEXT_EDIT' | 'FORMAT' | 'DELETE_MODIFIED' | 'STRUCTURAL' | 'MOVE_MODIFIED';
  confidenceScore?: number;
  affectedRegion?: {
    start: number;
    end: number;
  };
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