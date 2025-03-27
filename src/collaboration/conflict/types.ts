/**
 * Operational relationship between events
 */
export enum OperationRelationship {
  BEFORE = 'before',
  AFTER = 'after',
  CONCURRENT = 'concurrent',
  SAME = 'same'
}

/**
 * Types of conflicts that can be detected
 */
export enum ConflictType {
  TEXT_EDIT = 'TEXT_EDIT',
  FORMAT = 'FORMAT',
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  STRUCTURAL = 'STRUCTURAL',
  MOVE_MODIFIED = 'MOVE_MODIFIED'
}

/**
 * Result of conflict detection
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: OperationRelationship;
  conflictType?: ConflictType;
  confidenceScore?: number;
  affectedRegion?: {
    start: number;
    end: number;
  };
}

/**
 * Conflict resolution result
 */
export enum ConflictResolutionResult {
  MERGED = 'MERGED',
  LOCAL_WINS = 'LOCAL_WINS',
  REMOTE_WINS = 'REMOTE_WINS',
  UNRESOLVED = 'UNRESOLVED'
}

/**
 * Strategy for resolving conflicts
 */
export enum ConflictResolutionStrategy {
  MERGE = 'MERGE',
  LOCAL_FIRST = 'LOCAL_FIRST',
  REMOTE_FIRST = 'REMOTE_FIRST',
  MANUAL = 'MANUAL'
}

export interface Conflict {
  id: string;
  documentId: string;
  localEvent: DocumentEvent;
  remoteEvent: DocumentEvent;
  detectionResult: ConflictDetectionResult;
  createdAt: number;
  resolvedAt?: number;
  resolution?: ConflictResolution;
}

export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  resolvedEvents: DocumentEvent[];
  resolvedBy: string;
  customContent?: string;
  metadata?: Record<string, any>;
}

/**
 * Versioned operation with vector clock
 */
export interface VersionedOperation {
  id: string;
  userId: string;
  documentId: string;
  operation: {
    type: string;
    position: number;
    content?: string;
    length?: number;
    [key: string]: any;
  };
  clientId: string;
  timestamp: number;
  vectorClock: any;
}