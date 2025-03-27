import { DocumentEvent } from '../events/types';

/**
 * Types of operations relationship
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
  MOVE_MODIFIED = 'MOVE_MODIFIED',
  NONE = 'NONE'
}

/**
 * Result of conflict detection between operations
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
 * Interface for operations with versioning
 */
export interface VersionedOperation {
  id?: string;
  userId?: string;
  clientId?: string;
  documentId?: string;
  timestamp: number;
  vectorClock: Record<string, number> | {
    toRecord: () => Record<string, number>;
    getClock: () => Record<string, number>;
  };
  
  // Direct operation properties
  type?: string;
  position?: number;
  length?: number;
  text?: string;
  
  // OR nested operation object
  operation?: {
    type: string;
    position: number;
    content?: string;
    length?: number;
    attributes?: Record<string, any>;
  };
}

/**
 * Strategy for conflict resolution
 */
export enum ConflictResolutionStrategy {
  MERGE = 'MERGE',
  LOCAL_FIRST = 'LOCAL_FIRST',
  REMOTE_FIRST = 'REMOTE_FIRST',
  MANUAL = 'MANUAL',
  AI_ASSISTED = 'AI_ASSISTED'
}

/**
 * Result of conflict resolution
 */
export enum ConflictResolutionResult {
  MERGED = 'MERGED',
  LOCAL_WINS = 'LOCAL_WINS',
  REMOTE_WINS = 'REMOTE_WINS',
  UNRESOLVED = 'UNRESOLVED'
}

/**
 * Resolution for a conflict
 */
export interface ConflictResolution {
  strategy: ConflictResolutionStrategy;
  resolvedEvents: DocumentEvent[];
  resolvedBy: string;
  customContent?: string;
  metadata?: Record<string, any>;
  timestamp?: number;
  
  // For backward compatibility with tests
  result?: ConflictResolutionResult;
  resolvedEvent?: DocumentEvent;
}

/**
 * Interface representing a detected conflict
 */
export interface Conflict {
  id: string;
  documentId: string;
  localEvent: DocumentEvent;
  remoteEvent: DocumentEvent;
  type: ConflictType;
  severity: 'low' | 'medium' | 'high';
  description: string;
  createdAt: number;
  resolvedAt?: number;
  resolution?: ConflictResolution;
  
  // For backward compatibility with tests
  local?: any;
  remote?: any;
  localRegion?: { start: number; end: number; };
  remoteRegion?: { start: number; end: number; };
}