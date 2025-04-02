import { DocumentEvent } from '../events/types';
import { VectorClock } from './VectorClock';
import { ComplianceLogger } from '../../compliance/logger';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { 
  ConflictDetectionResult, 
  ConflictType, 
  OperationRelationship,
  VersionedOperation,
  Conflict
} from './types';

import { DocumentEvent as GenericDocumentEvent, DocumentOperation } from '../../types/document-events';
import { DocumentEvent as CollaborationDocumentEvent } from '../events/types';

// Export ConflictType for tests
export { ConflictType } from './types';

/**
 * Base operation interface for document editing operations
 */
export interface Operation {
  type: 'insert' | 'delete' | 'replace' | 'format' | 'move' | string; // Add string to accept any string type
  position: number;
  content?: string;
  length?: number;
  attributes?: Record<string, any>;
}

/**
 * Insert text operation
 */
export interface InsertOperation extends Operation {
  type: 'insert';
  text: string;
}

/**
 * Delete text operation
 */
export interface DeleteOperation extends Operation {
  type: 'delete';
  length: number;
}

/**
 * Replace text operation
 */
export interface ReplaceOperation extends Operation {
  type: 'replace';
  length: number;
  text: string;
}

/**
 * Format text operation
 */
export interface FormatOperation extends Operation {
  type: 'format';
  length: number;
  attributes: Record<string, any>;
}

/**
 * Move block operation
 */
export interface MoveOperation extends Operation {
  type: 'move';
  length: number;
  targetPosition: number;
}

/**
 * Configuration for conflict detection
 */
export interface ConflictDetectorConfig {
  /**
   * Minimum overlap percentage to consider regions conflicting
   */
  minOverlapPercentage: number;
  
  /**
   * Whether to log conflicts to compliance logs
   */
  logToCompliance: boolean;
}

/**
 * Interface for conflict detection results
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: string;
  conflictType?: string;
  confidenceScore?: number;
}

/**
 * Responsible for detecting conflicts between concurrent operations
 */
export class ConflictDetector {
  private config: ConflictDetectorConfig;
  
  constructor(
    private metricsCollector: MetricsCollector,
    config?: Partial<ConflictDetectorConfig>
  ) {
    this.config = {
      minOverlapPercentage: 1, // 1% overlap is considered a conflict by default
      logToCompliance: true,
      ...config
    };
  }

  /**
   * Detects potential conflicts between two events using vector clocks
   */
  async detectConflict(event1: GenericDocumentEvent, event2: GenericDocumentEvent): Promise<boolean> {
    // Convert to collaboration events if needed
    const collaborationEvent1 = convertToCollaborationEvent(event1);
    const collaborationEvent2 = convertToCollaborationEvent(event2);
    
    // Then proceed with conflict detection logic
    // ...
  }
  
  /**
   * Compares two vector clocks to determine their relationship
   */
  private compareVectorClocks(a: Record<string, number>, b: Record<string, number>): OperationRelationship {
    // If exactly the same vector clocks, they're the same operation
    if (JSON.stringify(a) === JSON.stringify(b)) {
      return OperationRelationship.SAME;
    }
    
    let aThenB = true; // Is a fully causally before b?
    let bThenA = true; // Is b fully causally before a?
    
    // Check if a has timestamps that are all less than or equal to b
    for (const nodeId in a) {
      if (!(nodeId in b) && a[nodeId] > 0) {
        bThenA = false;
        break;
      }
      
      if (nodeId in b && a[nodeId] > b[nodeId]) {
        bThenA = false;
        break;
      }
    }
    
    // Check if b has timestamps that are all less than or equal to a
    for (const nodeId in b) {
      if (!(nodeId in a) && b[nodeId] > 0) {
        aThenB = false;
        break;
      }
      
      if (nodeId in a && b[nodeId] > a[nodeId]) {
        aThenB = false;
        break;
      }
    }
    
    if (aThenB && !bThenA) return OperationRelationship.BEFORE;
    if (!aThenB && bThenA) return OperationRelationship.AFTER;
    return OperationRelationship.CONCURRENT;
  }
  
  /**
   * Identifies the type of conflict based on event types and content
   */
  private identifyConflictType(localEvent: DocumentEvent, remoteEvent: DocumentEvent): ConflictType {
    // Text editing conflicts (insert/delete overlap)
    if (this.isTextEditingConflict(localEvent, remoteEvent)) {
      return ConflictType.TEXT_EDIT;
    }
    
    // Format conflicts (same range, different formats)
    if (this.isFormatConflict(localEvent, remoteEvent)) {
      return ConflictType.FORMAT;
    }
    
    // One user deletes text another modified
    if (this.isDeleteModifiedConflict(localEvent, remoteEvent)) {
      return ConflictType.DELETE_MODIFIED;
    }
    
    // Structural conflicts (headings, lists, etc.)
    if (this.isStructuralConflict(localEvent, remoteEvent)) {
      return ConflictType.STRUCTURAL;
    }
    
    // Move conflicts (one user moves content another edits)
    if (this.isMoveModifiedConflict(localEvent, remoteEvent)) {
      return ConflictType.MOVE_MODIFIED;
    }
    
    return ConflictType.NONE;
  }
  
  /**
   * Determines if two events represent a text editing conflict
   */
  private isTextEditingConflict(eventA: DocumentEvent, eventB: DocumentEvent): boolean {
    // Check if both events are text edits
    if (!this.isTextEvent(eventA) || !this.isTextEvent(eventB)) {
      return false;
    }
    
    // Check for range overlap
    return this.doRangesOverlap(
      eventA.startPosition,
      eventA.endPosition || eventA.startPosition + (eventA.text?.length || 0),
      eventB.startPosition,
      eventB.endPosition || eventB.startPosition + (eventB.text?.length || 0)
    );
  }
  
  /**
   * Determines if two events represent a formatting conflict
   */
  private isFormatConflict(eventA: DocumentEvent, eventB: DocumentEvent): boolean {
    // Check if both events are format events
    if (!this.isFormatEvent(eventA) || !this.isFormatEvent(eventB)) {
      return false;
    }
    
    // Check for range overlap
    if (!this.doRangesOverlap(
      eventA.startPosition,
      eventA.endPosition,
      eventB.startPosition,
      eventB.endPosition
    )) {
      return false;
    }
    
    // Check if they're changing different attributes (which isn't a conflict)
    if (this.areDistinctFormatAttributes(eventA.attributes || {}, eventB.attributes || {})) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Determines if one event deletes text that the other modified
   */
  private isDeleteModifiedConflict(eventA: DocumentEvent, eventB: DocumentEvent): boolean {
    // Check if one is delete and one is edit
    const aIsDelete = this.isDeleteEvent(eventA);
    const bIsDelete = this.isDeleteEvent(eventB);
    
    if (!aIsDelete && !bIsDelete) return false; // Neither is a delete
    if (aIsDelete && bIsDelete) return false;   // Both are deletes (handled as text edit)
    
    // One is delete, one is edit
    const deleteEvent = aIsDelete ? eventA : eventB;
    const editEvent = aIsDelete ? eventB : eventA;
    
    // Check if edit affects text within delete range
    return this.doRangesOverlap(
      deleteEvent.startPosition,
      deleteEvent.endPosition,
      editEvent.startPosition,
      editEvent.endPosition || editEvent.startPosition + (editEvent.text?.length || 0)
    );
  }
  
  /**
   * Determines if two events represent a structural conflict
   */
  private isStructuralConflict(eventA: DocumentEvent, eventB: DocumentEvent): boolean {
    // Check if both events are structure-related
    if (!this.isStructuralEvent(eventA) || !this.isStructuralEvent(eventB)) {
      return false;
    }
    
    // Check for range overlap or adjacency
    return this.doRangesOverlapOrAdjacent(
      eventA.startPosition,
      eventA.endPosition,
      eventB.startPosition,
      eventB.endPosition
    );
  }
  
  /**
   * Determines if one event moves content that the other modifies
   */
  private isMoveModifiedConflict(eventA: DocumentEvent, eventB: DocumentEvent): boolean {
    // Check if one is move and one is edit
    const aIsMove = this.isMoveEvent(eventA);
    const bIsMove = this.isMoveEvent(eventB);
    
    if (!aIsMove && !bIsMove) return false; // Neither is a move
    if (aIsMove && bIsMove) return false;   // Both are moves (would be structural)
    
    // One is move, one is edit
    const moveEvent = aIsMove ? eventA : eventB;
    const editEvent = aIsMove ? eventB : eventA;
    
    // Check if edit affects text within moved range
    return this.doRangesOverlap(
      moveEvent.startPosition,
      moveEvent.endPosition,
      editEvent.startPosition,
      editEvent.endPosition || editEvent.startPosition + (editEvent.text?.length || 0)
    );
  }
  
  /**
   * Helper method to determine if ranges overlap
   */
  private doRangesOverlap(startA: number, endA: number, startB: number, endB: number): boolean {
    return Math.max(startA, startB) < Math.min(endA, endB);
  }
  
  /**
   * Helper method to determine if ranges overlap or are adjacent
   */
  private doRangesOverlapOrAdjacent(startA: number, endA: number, startB: number, endB: number): boolean {
    // Adjacent if end of one is start of other
    const adjacent = endA === startB || endB === startA;
    return this.doRangesOverlap(startA, endA, startB, endB) || adjacent;
  }
  
  /**
   * Helper to check if format attributes are completely distinct (no overlap)
   */
  private areDistinctFormatAttributes(a: Record<string, any>, b: Record<string, any>): boolean {
    for (const key in a) {
      if (key in b) {
        return false; // Found a common attribute
      }
    }
    return true;
  }
  
  /**
   * Determines if an event is a text editing event
   */
  private isTextEvent(event: DocumentEvent): boolean {
    return ['TEXT_INSERTED', 'TEXT_DELETED', 'TEXT_REPLACED'].includes(event.type);
  }
  
  /**
   * Determines if an event is a format event
   */
  private isFormatEvent(event: DocumentEvent): boolean {
    return ['FORMAT_APPLIED', 'FORMAT_REMOVED'].includes(event.type);
  }
  
  /**
   * Determines if an event is a delete event
   */
  private isDeleteEvent(event: DocumentEvent): boolean {
    return event.type === 'TEXT_DELETED';
  }
  
  /**
   * Determines if an event is a structural event
   */
  private isStructuralEvent(event: DocumentEvent): boolean {
    return ['LIST_CREATED', 'LIST_REMOVED', 'HEADING_CHANGED', 'BLOCK_CONVERTED'].includes(event.type);
  }
  
  /**
   * Determines if an event is a move event
   */
  private isMoveEvent(event: DocumentEvent): boolean {
    return event.type === 'BLOCK_MOVED';
  }
  
  /**
   * Determines the severity of a conflict
   */
  private determineSeverity(type: ConflictType, local: DocumentEvent, remote: DocumentEvent): 'low' | 'medium' | 'high' {
    switch (type) {
      case ConflictType.DELETE_MODIFIED:
        return 'high';   // Someone's edits could be lost
      case ConflictType.TEXT_EDIT:
        // Judge by size of overlap
        const localSize = (local.endPosition || 0) - (local.startPosition || 0);
        const remoteSize = (remote.endPosition || 0) - (remote.startPosition || 0);
        return Math.max(localSize, remoteSize) > 10 ? 'high' : 'medium';
      case ConflictType.FORMAT:
        return 'low';    // Format conflicts are usually minor
      case ConflictType.STRUCTURAL:
        return 'medium'; // Structure changes can be disruptive
      case ConflictType.MOVE_MODIFIED:
        return 'medium'; // Someone's edits may be relocated
      default:
        return 'low';
    }
  }
  
  /**
   * Generates a human-readable description of the conflict
   */
  private generateDescription(type: ConflictType, local: DocumentEvent, remote: DocumentEvent): string {
    switch (type) {
      case ConflictType.TEXT_EDIT:
        return `Concurrent text edits at positions ${local.startPosition}-${local.endPosition} and ${remote.startPosition}-${remote.endPosition}`;
      case ConflictType.FORMAT:
        return `Conflicting format changes at positions ${local.startPosition}-${local.endPosition}`;
      case ConflictType.DELETE_MODIFIED:
        const deleteEvent = this.isDeleteEvent(local) ? local : remote;
        return `Text deleted at positions ${deleteEvent.startPosition}-${deleteEvent.endPosition} that was also modified`;
      case ConflictType.STRUCTURAL:
        return `Conflicting structural changes at positions ${local.startPosition}-${local.endPosition} and ${remote.startPosition}-${remote.endPosition}`;
      case ConflictType.MOVE_MODIFIED:
        const moveEvent = this.isMoveEvent(local) ? local : remote;
        return `Content moved from positions ${moveEvent.startPosition}-${moveEvent.endPosition} that was also modified`;
      default:
        return 'Unknown conflict type';
    }
  }

  /**
   * Detects conflicts between operations with vector clocks
   * Used primarily for testing and integration with operational transform
   */
  detectOperationConflict(
    op1: VersionedOperation, 
    op2: VersionedOperation,
    clock1?: Record<string, number>,
    clock2?: Record<string, number>
  ): { hasConflict: boolean; relationship: OperationRelationship; conflictType?: ConflictType; affectedRegion?: { start: number; end: number; }; confidenceScore?: number; } {
    // Use vector clocks from operations if not explicitly provided
    const vectorClock1 = clock1 || (op1.vectorClock ? op1.vectorClock.getClock() : {});
    const vectorClock2 = clock2 || (op2.vectorClock ? op2.vectorClock.getClock() : {});
    
    // Compare vector clocks to determine relationship
    const relationship = this.compareVectorClocks(vectorClock1, vectorClock2);
    
    // If operations are causally related, no conflict
    if (relationship !== OperationRelationship.CONCURRENT) {
      return {
        hasConflict: false,
        relationship
      };
    }
    
    // Check for operations on the same region or overlapping regions
    const op1End = op1.operation.position + (this.getOperationLength(op1.operation) || 0);
    const op2End = op2.operation.position + (this.getOperationLength(op2.operation) || 0);
    
    // Check if ranges overlap
    const overlap = this.checkRangeOverlap(
      op1.operation.position, 
      op1End,
      op2.operation.position,
      op2End
    );
    
    if (!overlap) {
      return {
        hasConflict: false,
        relationship: OperationRelationship.CONCURRENT
      };
    }
    
    // Determine conflict type based on operation types
    let conflictType: ConflictType;
    
    if (op1.operation.type === 'delete' || op2.operation.type === 'delete') {
      conflictType = ConflictType.DELETE_MODIFIED;
    } else if (op1.operation.type === 'format' || op2.operation.type === 'format') {
      conflictType = ConflictType.FORMAT;
    } else if (op1.operation.type === 'move' || op2.operation.type === 'move') {
      conflictType = ConflictType.MOVE_MODIFIED;
    } else {
      conflictType = ConflictType.TEXT_EDIT;
    }
    
    // Calculate confidence score (higher for larger overlaps)
    const overlapStart = Math.max(op1.operation.position, op2.operation.position);
    const overlapEnd = Math.min(op1End, op2End);
    const overlapSize = overlapEnd - overlapStart;
    const maxSize = Math.max(
      this.getOperationLength(op1.operation) || 0,
      this.getOperationLength(op2.operation) || 0
    );
    
    const confidenceScore = maxSize > 0 ? Math.min(0.99, overlapSize / maxSize) : 0.5;
    
    return {
      hasConflict: true,
      relationship: OperationRelationship.CONCURRENT,
      conflictType,
      affectedRegion: {
        start: overlapStart,
        end: overlapEnd
      },
      confidenceScore: Math.max(0.8, confidenceScore) // Minimum confidence of 0.8
    };
  }

  /**
   * Helper to get the effective length of an operation
   */
  private getOperationLength(operation: Operation): number {
    switch (operation.type) {
      case 'insert':
        return operation.content?.length || 0;
      case 'delete':
      case 'replace':
      case 'format':
        return operation.length || 0;
      case 'move':
        return (operation as any).endPosition - (operation as any).startPosition || 0;
      default:
        // Handle any other string types
        return operation.length || (operation.content?.length || 0);
    }
  }

  /**
   * Detects conflicts between document operations
   */
  detectConflicts(document: any, operations: any[]): any[] {
    // Implement conflict detection logic here
    return [];
  }

  /**
   * Detects a conflict between two versioned operations
   */
  detectVersionedConflict(
    op1: VersionedOperation, 
    op2: VersionedOperation,
    clock1?: Record<string, number>, 
    clock2?: Record<string, number>
  ): ConflictDetectionResult {
    // Helper functions to safely access properties
    const getPosition = (op: VersionedOperation): number => {
      return op.position ?? (op.operation?.position ?? 0);
    };
    
    const getLength = (op: VersionedOperation): number => {
      return op.length ?? 
        op.operation?.length ?? 
        (op.text?.length ?? op.operation?.content?.length ?? 0);
    };
    
    const getType = (op: VersionedOperation): string => {
      return op.type ?? (op.operation?.type ?? '');
    };
    
    const getVectorClock = (op: VersionedOperation, providedClock?: Record<string, number>): Record<string, number> => {
      if (providedClock) return providedClock;
      
      // Handle both direct Record<string, number> and VectorClock object
      if (typeof op.vectorClock === 'object' && 'toRecord' in op.vectorClock) {
        return op.vectorClock.toRecord();
      } else if (typeof op.vectorClock === 'object' && 'getClock' in op.vectorClock) {
        return op.vectorClock.getClock();
      }
      
      return op.vectorClock as Record<string, number>;
    };
    
    // Get vector clocks
    const vectorClock1 = getVectorClock(op1, clock1);
    const vectorClock2 = getVectorClock(op2, clock2);
    
    // Compare operations based on timestamp for basic ordering
    if (op1.timestamp < op2.timestamp - 1000) {
      return {
        hasConflict: false,
        relationship: OperationRelationship.BEFORE
      };
    }
    
    if (op1.timestamp > op2.timestamp + 1000) {
      return {
        hasConflict: false,
        relationship: OperationRelationship.AFTER
      };
    }
    
    // Check if operations modify overlapping regions
    const op1End = getPosition(op1) + getLength(op1);
    const op2End = getPosition(op2) + getLength(op2);
    
    // Check for overlap
    const overlap = this.checkRangeOverlap(
      getPosition(op1),
      op1End,
      getPosition(op2),
      op2End
    );
    
    if (!overlap) {
      return {
        hasConflict: false,
        relationship: OperationRelationship.CONCURRENT
      };
    }
    
    // Determine conflict type based on operation types
    let conflictType: ConflictType;
    
    if (getType(op1) === 'delete' || getType(op2) === 'delete') {
      conflictType = ConflictType.DELETE_MODIFIED;
    } else if (getType(op1) === 'format' || getType(op2) === 'format') {
      conflictType = ConflictType.FORMAT;
    } else if (getType(op1) === 'move' || getType(op2) === 'move') {
      conflictType = ConflictType.MOVE_MODIFIED;
    } else {
      conflictType = ConflictType.TEXT_EDIT;
    }
    
    // Calculate overlap details for confidence
    const overlapStart = Math.max(getPosition(op1), getPosition(op2));
    const overlapEnd = Math.min(op1End, op2End);
    const overlapSize = overlapEnd - overlapStart;
    
    const maxSize = Math.max(getLength(op1), getLength(op2));
    const confidenceScore = maxSize > 0 ? Math.min(0.99, overlapSize / maxSize) : 0.5;
    
    return {
      hasConflict: true,
      relationship: OperationRelationship.CONCURRENT,
      conflictType,
      confidenceScore: Math.max(0.7, confidenceScore),
      affectedRegion: {
        start: overlapStart,
        end: overlapEnd
      }
    };
  }
  
  /**
   * Check if two ranges overlap
   */
  private checkRangeOverlap(
    start1: number, 
    end1: number, 
    start2: number, 
    end2: number
  ): boolean {
    return start1 <= end2 && start2 <= end1;
  }

  /**
   * Detect if two operations conflict with each other
   */
  detectConflict(op1: VersionedOperation, op2: VersionedOperation): ConflictDetectionResult {
    // Determine relationship between operations
    const relationship = this.determineRelationship(op1, op2);
    
    // Only concurrent operations can conflict
    if (relationship !== 'concurrent') {
      return {
        hasConflict: false,
        relationship: relationship,
        conflictType: undefined,
        confidenceScore: undefined
      };
    }
    
    // For concurrent operations, determine conflict type
    const conflictType = this.determineConflictType(op1, op2);
    const hasConflict = !!conflictType;
    
    return {
      hasConflict,
      relationship,
      conflictType,
      confidenceScore: hasConflict ? this.calculateConfidence(op1, op2) : undefined
    };
  }
  
  // Helper methods
  private determineRelationship(op1: VersionedOperation, op2: VersionedOperation): string {
    // Check vector clocks
    if (this.isHappenedBefore(op1.vectorClock, op2.vectorClock)) {
      return 'before';
    } else if (this.isHappenedBefore(op2.vectorClock, op1.vectorClock)) {
      return 'after';
    } else {
      return 'concurrent';
    }
  }
  
  private isHappenedBefore(vectorClock1: Record<string, number>, vectorClock2: Record<string, number>): boolean {
    // Implementation of "happened before" relationship
    let foundLess = false;
    
    for (const clientId in vectorClock1) {
      if (!(clientId in vectorClock2) || vectorClock1[clientId] > vectorClock2[clientId]) {
        return false;
      }
      if (vectorClock1[clientId] < vectorClock2[clientId]) {
        foundLess = true;
      }
    }
    
    return foundLess;
  }
  
  private determineConflictType(op1: VersionedOperation, op2: VersionedOperation): string | undefined {
    // Simplified conflict type detection
    const type1 = op1.operation?.type;
    const type2 = op2.operation?.type;
    
    if (type1 === 'TEXT_EDIT' && type2 === 'TEXT_EDIT') {
      // Check for overlapping ranges
      if (this.hasOverlappingRanges(op1.operation, op2.operation)) {
        return 'TEXT_EDIT';
      }
    } else if ((type1 === 'DELETE' && type2 === 'EDIT') || (type1 === 'EDIT' && type2 === 'DELETE')) {
      return 'DELETE_MODIFIED';
    } else if (type1 === 'FORMAT' && type2 === 'FORMAT') {
      if (this.hasOverlappingRanges(op1.operation, op2.operation)) {
        return 'FORMAT';
      }
    }
    
    return undefined;
  }
  
  private hasOverlappingRanges(op1: any, op2: any): boolean {
    // Simple range overlap check
    const start1 = op1.range?.start || op1.position || 0;
    const end1 = op1.range?.end || (start1 + (op1.text?.length || 0));
    
    const start2 = op2.range?.start || op2.position || 0;
    const end2 = op2.range?.end || (start2 + (op2.text?.length || 0));
    
    return !(end1 <= start2 || end2 <= start1);
  }
  
  private calculateConfidence(op1: VersionedOperation, op2: VersionedOperation): number {
    // Simple confidence score calculation
    const conflictType = this.determineConflictType(op1, op2);
    
    if (conflictType === 'TEXT_EDIT') {
      return 0.8;
    } else if (conflictType === 'FORMAT') {
      return 0.7;
    } else if (conflictType === 'DELETE_MODIFIED') {
      return 0.9;
    }
    
    return 0.5;
  }
}

/**
 * Fix for the typed operation mismatch - convert between the different event types
 */
function convertToCollaborationEvent(event: GenericDocumentEvent): CollaborationDocumentEvent {
  // Handle string operations by converting them to structured operations
  const operation = typeof event.operation === 'string'
    ? {
        type: 'insert',
        position: event.position || 0,
        content: event.operation,
      }
    : event.operation;

  return {
    id: event.id,
    documentId: event.documentId,
    userId: event.userId,
    operation: operation,
    timestamp: event.timestamp,
    version: event.version,
    type: event.type,
    metadata: event.metadata,
    vectorClock: event.vectorClock
  };
}