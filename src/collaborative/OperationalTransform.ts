export type Operation = 
  | InsertOperation 
  | DeleteOperation 
  | ReplaceOperation;

export interface InsertOperation {
  type: 'insert';
  position: number;
  text: string;
  userId: string;
  timestamp: number;
}

export interface DeleteOperation {
  type: 'delete';
  position: number;
  length: number;
  userId: string;
  timestamp: number;
}

export interface ReplaceOperation {
  type: 'replace';
  position: number;
  length: number;
  text: string;
  userId: string;
  timestamp: number;
}

export class OperationalTransform {
  /**
   * Transform operation A against operation B
   * Returns a new operation that has the same intent as A but works
   * in the context after B has been applied
   */
  static transform(a: Operation, b: Operation): Operation {
    if (b.type === 'insert') {
      return this.transformAgainstInsert(a, b);
    } else if (b.type === 'delete') {
      return this.transformAgainstDelete(a, b);
    } else {
      // Replace operations can be treated as delete + insert
      const deleteOp: DeleteOperation = {
        type: 'delete',
        position: b.position,
        length: b.length,
        userId: b.userId,
        timestamp: b.timestamp
      };
      
      const insertOp: InsertOperation = {
        type: 'insert',
        position: b.position,
        text: b.text,
        userId: b.userId,
        timestamp: b.timestamp
      };
      
      // Transform against delete first, then against insert
      const afterDelete = this.transformAgainstDelete(a, deleteOp);
      return this.transformAgainstInsert(afterDelete, insertOp);
    }
  }
  
  private static transformAgainstInsert(a: Operation, b: InsertOperation): Operation {
    // If inserting at a position before or at our operation's position,
    // we need to shift our operation's position
    if (a.type === 'insert' || a.type === 'delete' || a.type === 'replace') {
      if (b.position <= a.position) {
        return {
          ...a,
          position: a.position + b.text.length
        };
      }
    }
    
    // Special case for replace operations
    if (a.type === 'replace' && b.position > a.position && b.position < a.position + a.length) {
      // Insert happened within the range of text being replaced
      // Need to adjust the length of text being replaced
      return {
        ...a,
        length: a.length + b.text.length
      };
    }
    
    return a; // No transformation needed
  }
  
  private static transformAgainstDelete(a: Operation, b: DeleteOperation): Operation {
    if (a.type === 'insert') {
      // If we're inserting after the deleted region, shift our position backward
      if (a.position >= b.position + b.length) {
        return {
          ...a,
          position: a.position - b.length
        };
      } 
      // If we're inserting within the deleted region, move to the start of deletion
      else if (a.position > b.position && a.position < b.position + b.length) {
        return {
          ...a,
          position: b.position
        };
      }
    }
    
    if (a.type === 'delete' || a.type === 'replace') {
      // Various cases for how delete/replace operations transform against another delete
      // This part needs careful implementation based on the exact semantics required
      // Implementation details depend on how you want to handle overlapping deletes
      
      // Simple case: if we're after the deleted region, shift position backward
      if (a.position >= b.position + b.length) {
        return {
          ...a,
          position: a.position - b.length
        };
      }
      
      // Complex cases involve partial overlaps between the operations
      // Implementation would go here
    }
    
    return a; // Default case
  }
}