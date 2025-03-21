/**
 * Operational Transform module for handling concurrent document edits
 * This implementation supports text-based operations with transformation functions
 * to ensure convergence across distributed clients
 */

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

/**
 * Implementation of operational transform algorithms for concurrent edit handling
 */
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
  
  /**
   * Transform an operation against an insert operation
   */
  private static transformAgainstInsert(a: Operation, b: InsertOperation): Operation {
    // If inserting at a position before or at our operation's position,
    // we need to shift our operation's position
    if (a.type === 'insert') {
      if (b.position <= a.position) {
        return {
          ...a,
          position: a.position + b.text.length
        };
      }
      return a;
    } 
    
    if (a.type === 'delete') {
      // If the insert happens before the deletion, shift the deletion
      if (b.position <= a.position) {
        return {
          ...a,
          position: a.position + b.text.length
        };
      }
      // If the insert happens within the deletion range
      else if (b.position < a.position + a.length) {
        return {
          ...a,
          length: a.length + b.text.length
        };
      }
      return a;
    }
    
    if (a.type === 'replace') {
      // If the insert happens before the replacement, shift the replacement
      if (b.position <= a.position) {
        return {
          ...a,
          position: a.position + b.text.length
        };
      }
      // If the insert happens within the replacement range
      else if (b.position < a.position + a.length) {
        return {
          ...a,
          length: a.length + b.text.length
        };
      }
      return a;
    }
    
    return a;
  }
  
  /**
   * Transform an operation against a delete operation
   */
  private static transformAgainstDelete(a: Operation, b: DeleteOperation): Operation {
    const bEndPos = b.position + b.length;
    
    if (a.type === 'insert') {
      // Insert position is after the deleted region
      if (a.position >= bEndPos) {
        return {
          ...a,
          position: a.position - b.length
        };
      }
      // Insert position is within the deleted region
      else if (a.position >= b.position) {
        return {
          ...a,
          position: b.position
        };
      }
      return a;
    }
    
    if (a.type === 'delete') {
      // Deletion entirely after the other deletion
      if (a.position >= bEndPos) {
        return {
          ...a,
          position: a.position - b.length
        };
      }
      // Deletion entirely before the other deletion
      else if (a.position + a.length <= b.position) {
        return a;
      }
      // Deletion overlaps with the other deletion
      else {
        // Calculate the portions of a that are not deleted by b
        const aEndPos = a.position + a.length;
        
        // Case 1: b completely contains a
        if (b.position <= a.position && bEndPos >= aEndPos) {
          return {
            ...a,
            position: b.position,
            length: 0
          };
        }
        
        // Case 2: b deletes a prefix of a
        if (b.position <= a.position && bEndPos < aEndPos) {
          return {
            ...a,
            position: b.position,
            length: aEndPos - bEndPos
          };
        }
        
        // Case 3: b deletes a suffix of a
        if (b.position > a.position && bEndPos >= aEndPos) {
          return {
            ...a,
            length: b.position - a.position
          };
        }
        
        // Case 4: b deletes a middle part of a
        return {
          ...a,
          length: a.length - b.length
        };
      }
    }
    
    if (a.type === 'replace') {
      // Similar logic to delete operations
      // Replace entirely after the deletion
      if (a.position >= bEndPos) {
        return {
          ...a,
          position: a.position - b.length
        };
      }
      // Replace entirely before the deletion
      else if (a.position + a.length <= b.position) {
        return a;
      }
      // Replace overlaps with the deletion
      else {
        // This is a complex case that would require merging the operations
        // A realistic implementation would need to handle partial text deletions
        // For this example, we'll use a simplified approach
        const aEndPos = a.position + a.length;
        
        // Case 1: b completely contains a
        if (b.position <= a.position && bEndPos >= aEndPos) {
          return {
            ...a,
            position: b.position,
            length: 0,
            text: ''
          };
        }
        
        // Case 2: b deletes a prefix of a
        if (b.position <= a.position && bEndPos < aEndPos) {
          const charsDeletionOverlap = bEndPos - a.position;
          return {
            ...a,
            position: b.position,
            length: a.length - charsDeletionOverlap,
            text: a.text.substring(charsDeletionOverlap)
          };
        }
        
        // Case 3: b deletes a suffix of a
        if (b.position > a.position && bEndPos >= aEndPos) {
          const charsRemaining = b.position - a.position;
          return {
            ...a,
            length: charsRemaining,
            text: a.text.substring(0, charsRemaining)
          };
        }
        
        // Case 4: b deletes a middle part of a
        const prefixLength = b.position - a.position;
        const suffixStart = prefixLength + b.length;
        const newText = a.text.substring(0, prefixLength) + a.text.substring(suffixStart);
        
        return {
          ...a,
          length: a.length - b.length,
          text: newText
        };
      }
    }
    
    return a;
  }
  
  /**
   * Apply an operation to a document
   */
  static apply(doc: string, op: Operation): string {
    if (op.type === 'insert') {
      return doc.slice(0, op.position) + op.text + doc.slice(op.position);
    } 
    else if (op.type === 'delete') {
      return doc.slice(0, op.position) + doc.slice(op.position + op.length);
    }
    else if (op.type === 'replace') {
      return doc.slice(0, op.position) + op.text + doc.slice(op.position + op.length);
    }
    return doc;
  }
  
  /**
   * Compose two operations into a single operation
   */
  static compose(a: Operation, b: Operation): Operation {
    // This is a simplified implementation - a real-world one would handle
    // all possible combinations of operations
    
    // Simple case: two inserts at the same position
    if (a.type === 'insert' && b.type === 'insert' && b.position === a.position + a.text.length) {
      return {
        type: 'insert',
        position: a.position,
        text: a.text + b.text,
        userId: b.userId,
        timestamp: b.timestamp
      };
    }
    
    // Simple case: delete followed by delete at the same position
    if (a.type === 'delete' && b.type === 'delete' && b.position === a.position) {
      return {
        type: 'delete',
        position: a.position,
        length: a.length + b.length,
        userId: b.userId,
        timestamp: b.timestamp
      };
    }
    
    // For other cases, we need more complex logic - this is just a placeholder
    // A full implementation would need to handle all operation combinations
    
    // Default: return b as the composed operation
    return b;
  }
}