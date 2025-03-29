import { VersionedOperation, ConflictDetectionResult } from '../collaboration/types';

export class ConflictDetector {
  detectConflicts(document: any, operations: any[]): any[] {
    // Implement conflict detection logic here
    return [];
  }

  // Finish the implementation of detectConflict to include all properties used in tests
  detectConflict(op1: VersionedOperation, op2: VersionedOperation, 
                clock1: any, clock2: any): ConflictDetectionResult | null {
    // Implementation based on what your tests expect
    if (op1.timestamp < op2.timestamp - 1000) {
      return {
        hasConflict: false,
        relationship: 'before'
      };
    }
    
    if (op1.timestamp > op2.timestamp + 1000) {
      return {
        hasConflict: false,
        relationship: 'after'
      };
    }
    
    // Check if operations modify overlapping regions
    const op1End = op1.position + (op1.length || 0);
    const op2End = op2.position + (op2.length || 0);
    
    if (op1.position <= op2End && op2.position <= op1End) {
      // Operations have overlapping regions
      if (op1.type === 'delete' && op2.type !== 'delete') {
        return {
          hasConflict: true,
          relationship: 'concurrent',
          conflictType: 'DELETE_MODIFIED',
          confidenceScore: 0.8,
          affectedRegion: {
            start: Math.min(op1.position, op2.position),
            end: Math.max(op1End, op2End)
          }
        };
      }
      
      return {
        hasConflict: true,
        relationship: 'concurrent',
        conflictType: op1.type === 'format' || op2.type === 'format' ? 
          'FORMAT' : 'TEXT_EDIT',
        confidenceScore: 0.8,
        affectedRegion: {
          start: Math.min(op1.position, op2.position),
          end: Math.max(op1End, op2End)
        }
      };
    }
    
    // Non-overlapping operations
    return {
      hasConflict: false,
      relationship: 'concurrent'
    };
  }
}