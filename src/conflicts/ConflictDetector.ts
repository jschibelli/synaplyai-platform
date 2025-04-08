import { VersionedOperation } from '../collaborative/types';

export enum ConflictType {
  TEXT_EDIT = 'TEXT_EDIT',
  FORMAT = 'FORMAT',
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  STRUCTURAL = 'STRUCTURAL',
  MOVE_MODIFIED = 'MOVE_MODIFIED',
  NONE = 'NONE'
}

export type OperationRelationship = 'before' | 'after' | 'concurrent' | 'identical';

export interface ConflictResult {
  hasConflict: boolean;
  relationship: OperationRelationship;
  conflictType?: ConflictType;
  affectedRegion?: { start: number; end: number; };
  confidenceScore?: number;
  description?: string;
}

/**
 * Detects conflicts between operations in collaborative editing
 */
export class ConflictDetector {
  /**
   * Detects if there's a conflict between two operations
   * @param op1 First operation
   * @param op2 Second operation
   * @returns A detailed conflict result object
   */
  detectConflict(op1: VersionedOperation, op2: VersionedOperation): ConflictResult {
    // If operations are from the same user or have the same ID, no conflict
    if (op1.userId === op2.userId || op1.id === op2.id) {
      return {
        hasConflict: false,
        relationship: 'identical',
        conflictType: ConflictType.NONE,
        description: 'Operations from same user or with same ID'
      };
    }

    // If operations are on different documents, no conflict
    if (op1.documentId !== op2.documentId) {
      return {
        hasConflict: false,
        relationship: 'concurrent',
        conflictType: ConflictType.NONE,
        description: 'Operations on different documents'
      };
    }

    // Compare timestamps or versions to determine ordering
    if (op1.timestamp && op2.timestamp) {
      const timeDiff = op1.timestamp - op2.timestamp;
      if (timeDiff < -1000) {
        return {
          hasConflict: false,
          relationship: 'before',
          conflictType: ConflictType.NONE,
          description: 'First operation happened significantly before second'
        };
      }
      
      if (timeDiff > 1000) {
        return {
          hasConflict: false,
          relationship: 'after',
          conflictType: ConflictType.NONE,
          description: 'First operation happened significantly after second'
        };
      }
    } else if (op1.version !== op2.version) {
      // Use version if timestamps aren't available
      if (op1.version < op2.version) {
        return {
          hasConflict: false,
          relationship: 'before',
          conflictType: ConflictType.NONE,
          description: 'First operation has earlier version'
        };
      } else {
        return {
          hasConflict: false,
          relationship: 'after',
          conflictType: ConflictType.NONE,
          description: 'First operation has later version'
        };
      }
    }

    // Check for vector clock causality if available
    if (op1.vectorClock && op2.vectorClock) {
      const vec1 = this.getVectorClockRecord(op1.vectorClock);
      const vec2 = this.getVectorClockRecord(op2.vectorClock);
      
      const comparison = this.compareVectorClocks(vec1, vec2);
      if (comparison < 0) {
        return {
          hasConflict: false,
          relationship: 'before',
          conflictType: ConflictType.NONE,
          description: 'First operation happened before second (vector clock)'
        };
      } else if (comparison > 0) {
        return {
          hasConflict: false,
          relationship: 'after',
          conflictType: ConflictType.NONE,
          description: 'First operation happened after second (vector clock)'
        };
      }
      // If comparison == 0, the operations are concurrent, continue checking
    }

    // If we get here, the operations are potentially concurrent.
    // We need to check if they affect overlapping regions of the document.
    
    // Get positions and lengths, handling both direct properties and nested operation objects
    const pos1 = this.getPosition(op1);
    const pos2 = this.getPosition(op2);
    const len1 = this.getLength(op1);
    const len2 = this.getLength(op2);
    const end1 = pos1 + len1;
    const end2 = pos2 + len2;
    
    // Check for overlap - if regions don't overlap, no conflict
    if (end1 <= pos2 || end2 <= pos1) {
      return {
        hasConflict: false,
        relationship: 'concurrent',
        conflictType: ConflictType.NONE,
        description: 'Concurrent operations without positional overlap'
      };
    }
    
    // Calculate overlap details
    const overlapStart = Math.max(pos1, pos2);
    const overlapEnd = Math.min(end1, end2);
    const overlapSize = overlapEnd - overlapStart;
    
    // Determine conflict type based on operation types
    let conflictType: ConflictType;
    const type1 = this.getOperationType(op1);
    const type2 = this.getOperationType(op2);
    
    if (type1 === 'format' || type2 === 'format') {
      // Detect FORMAT conflicts - check if they modify the same attributes
      const attributes1 = this.getAttributes(op1);
      const attributes2 = this.getAttributes(op2);
      
      if (attributes1 && attributes2) {
        // Check for conflicting attribute keys
        const keys1 = Object.keys(attributes1);
        const keys2 = Object.keys(attributes2);
        
        // If they modify completely different attributes, there's no conflict
        const hasCommonKey = keys1.some(key => keys2.includes(key));
        
        if (!hasCommonKey) {
          return {
            hasConflict: false,
            relationship: 'concurrent',
            conflictType: ConflictType.NONE,
            description: 'Concurrent format operations with non-overlapping attributes'
          };
        }
      }
      
      conflictType = ConflictType.FORMAT;
    } else if (type1 === 'delete' || type2 === 'delete') {
      conflictType = ConflictType.DELETE_MODIFIED;
    } else if (type1 === 'move' || type2 === 'move') {
      conflictType = ConflictType.MOVE_MODIFIED;
    } else if (type1 === 'structure' || type2 === 'structure') {
      conflictType = ConflictType.STRUCTURAL;
    } else {
      conflictType = ConflictType.TEXT_EDIT;
    }
    
    // Calculate confidence score based on overlap size relative to operation sizes
    const maxLength = Math.max(len1, len2);
    const confidenceScore = maxLength > 0 ? Math.min(0.99, Math.max(0.7, overlapSize / maxLength)) : 0.8;
    
    return {
      hasConflict: true,
      relationship: 'concurrent',
      conflictType,
      confidenceScore,
      affectedRegion: {
        start: overlapStart,
        end: overlapEnd
      },
      description: `Conflict detected: ${conflictType} between concurrent operations`
    };
  }
  
  /**
   * Detects conflicts in a set of operations on a document
   * @param operations Array of operations to check
   * @returns Array of conflicting operations
   */
  detectConflicts(operations: VersionedOperation[]): VersionedOperation[][] {
    const conflicts: VersionedOperation[][] = [];
    
    // For each pair of operations, check for conflicts
    for (let i = 0; i < operations.length; i++) {
      for (let j = i + 1; j < operations.length; j++) {
        const result = this.detectConflict(operations[i], operations[j]);
        if (result.hasConflict) {
          conflicts.push([operations[i], operations[j]]);
        }
      }
    }
    
    return conflicts;
  }
  
  /**
   * Helper function to get position from an operation
   */
  private getPosition(op: VersionedOperation): number {
    if (op.position !== undefined) {
      return op.position;
    }
    if (op.operation?.position !== undefined) {
      return op.operation.position;
    }
    return 0;
  }
  
  /**
   * Helper function to get length from an operation
   */
  private getLength(op: VersionedOperation): number {
    if (op.length !== undefined) {
      return op.length;
    }
    if (op.operation?.length !== undefined) {
      return op.operation.length;
    }
    if (op.text) {
      return op.text.length;
    }
    if (op.operation?.text) {
      return op.operation.text.length;
    }
    if (op.operation?.content) {
      return op.operation.content.length;
    }
    return 0;
  }
  
  /**
   * Helper function to get operation type
   */
  private getOperationType(op: VersionedOperation): string {
    if (op.type) {
      return op.type;
    }
    if (op.operation?.type) {
      return op.operation.type;
    }
    return 'insert'; // Default to insert
  }
  
  /**
   * Helper function to get attributes from format operations
   */
  private getAttributes(op: VersionedOperation): Record<string, any> | undefined {
    if (op.operation?.attributes) {
      return op.operation.attributes;
    }
    return undefined;
  }
  
  /**
   * Helper to get vector clock as a record
   */
  private getVectorClockRecord(vectorClock: Record<string, number> | { toRecord(): Record<string, number> }): Record<string, number> {
    if (typeof (vectorClock as any).toRecord === 'function') {
      return (vectorClock as { toRecord(): Record<string, number> }).toRecord();
    }
    return vectorClock as Record<string, number>;
  }
  
  /**
   * Compare two vector clocks
   * Returns -1 if vc1 happens before vc2
   * Returns 1 if vc1 happens after vc2
   * Returns 0 if vc1 and vc2 are concurrent
   */
  private compareVectorClocks(vc1: Record<string, number>, vc2: Record<string, number>): number {
    let vc1GtVc2 = false;
    let vc2GtVc1 = false;
    
    // Check all keys in vc1
    for (const id in vc1) {
      if (!vc2[id] || vc1[id] > vc2[id]) {
        vc1GtVc2 = true;
      } else if (vc1[id] < vc2[id]) {
        vc2GtVc1 = true;
      }
    }
    
    // Check for any keys in vc2 that are not in vc1
    for (const id in vc2) {
      if (!vc1[id]) {
        vc2GtVc1 = true;
      }
    }
    
    // Determine relationship based on comparison results
    if (vc1GtVc2 && !vc2GtVc1) {
      return 1; // vc1 happens after vc2
    } else if (!vc1GtVc2 && vc2GtVc1) {
      return -1; // vc1 happens before vc2
    } else if (vc1GtVc2 && vc2GtVc1) {
      return 0; // concurrent operations
    } else {
      return 0; // identical vector clocks
    }
  }
}

// Export a singleton instance by default
export default new ConflictDetector();