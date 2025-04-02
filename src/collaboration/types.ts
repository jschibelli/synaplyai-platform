// Update this file to align with the definition in document-events.ts

import { DocumentEvent, VersionedOperation as BaseVersionedOperation } from '../types/document-events';

// Re-export the VersionedOperation from document-events.ts to ensure consistency
export type VersionedOperation = BaseVersionedOperation;

// Additional types specific to collaboration can be defined here
export interface CollaborationSession {
  documentId: string;
  participants: string[];
  active: boolean;
  startTime: number;
  lastActivity: number;
}

// Other collaboration-specific types...

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