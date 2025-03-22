export interface BaseOperation {
  type: string;
  userId: string;
  timestamp: number;
}

export interface InsertOperation extends BaseOperation {
  type: 'insert';
  position: number;
  text: string;
}

export interface DeleteOperation extends BaseOperation {
  type: 'delete';
  position: number;
  length: number;
}

export interface ReplaceOperation extends BaseOperation {
  type: 'replace';
  position: number;
  length: number;
  text: string;
}

export type Operation = InsertOperation | DeleteOperation | ReplaceOperation;

export class OperationalTransform {
  /**
   * Transform operation against another operation
   * Returns a transformed operation that can be applied after the other operation
   */
  static transform(op1: Operation, op2: Operation): Operation {
    try {
      // Insert vs Insert
      if (op1.type === 'insert' && op2.type === 'insert') {
        // If op2 inserts at a position before or at op1's position,
        // op1's position needs to be shifted by the length of op2's text
        if (op2.position <= op1.position) {
          return {
            ...op1,
            position: op1.position + op2.text.length
          };
        }
        // Otherwise, op1 remains unchanged
        return { ...op1 };
      }
      
      // Insert vs Delete
      if (op1.type === 'insert' && op2.type === 'delete') {
        if (op2.position <= op1.position) {
          // If op2 deletes before op1's position, adjust op1's position
          // Position is reduced by the amount of text deleted before op1's position
          const overlapEnd = op2.position + op2.length;
          const affect = Math.max(0, Math.min(overlapEnd - op1.position, op2.length));
          return {
            ...op1,
            position: op1.position - affect
          };
        }
        // Otherwise, op1 remains unchanged
        return { ...op1 };
      }
      
      // Delete vs Insert
      if (op1.type === 'delete' && op2.type === 'insert') {
        if (op2.position <= op1.position) {
          // If op2 inserts before op1's position, op1's position needs to be shifted
          return {
            ...op1,
            position: op1.position + op2.text.length
          };
        } else if (op2.position < op1.position + op1.length) {
          // If op2 inserts within the range op1 is deleting, 
          // the delete length needs to be extended
          return {
            ...op1,
            length: op1.length + op2.text.length
          };
        }
        // Otherwise, op1 remains unchanged
        return { ...op1 };
      }
      
      // Delete vs Delete
      if (op1.type === 'delete' && op2.type === 'delete') {
        // Four cases: before, overlapping from left, contained within, overlapping from right
        if (op2.position + op2.length <= op1.position) {
          // op2 is entirely before op1
          return {
            ...op1,
            position: op1.position - op2.length
          };
        } else if (op2.position <= op1.position && op2.position + op2.length >= op1.position + op1.length) {
          // op2 completely contains op1
          // op1 becomes a no-op with length 0
          return {
            ...op1,
            position: op2.position,
            length: 0
          };
        } else if (op2.position <= op1.position) {
          // op2 overlaps from left
          const remaining = op1.position + op1.length - (op2.position + op2.length);
          return {
            ...op1,
            position: op2.position,
            length: Math.max(0, remaining)
          };
        } else if (op2.position < op1.position + op1.length) {
          // op2 overlaps from right or is contained within op1
          const overlap = (op1.position + op1.length) - op2.position;
          return {
            ...op1,
            length: op1.length - Math.min(overlap, op2.length)
          };
        }
        // Otherwise, op1 remains unchanged
        return { ...op1 };
      }
      
      // Replace operations - handle as delete + insert for simplicity
      if (op1.type === 'replace') {
        // First transform as delete
        const deleteOp: DeleteOperation = {
          type: 'delete',
          position: op1.position,
          length: op1.length,
          userId: op1.userId,
          timestamp: op1.timestamp
        };
        
        const transformedDelete = this.transform(deleteOp, op2) as DeleteOperation;
        
        // Then transform as insert
        const insertOp: InsertOperation = {
          type: 'insert',
          position: op1.position,
          text: op1.text,
          userId: op1.userId,
          timestamp: op1.timestamp
        };
        
        const transformedInsert = this.transform(insertOp, op2) as InsertOperation;
        
        // Combine into replace
        return {
          type: 'replace',
          position: transformedInsert.position,
          length: transformedDelete.length,
          text: transformedInsert.text,
          userId: op1.userId,
          timestamp: op1.timestamp
        };
      }
      
      // Default fallback is to return the operation unchanged
      return { ...op1 };
    } catch (error) {
      // Log the error for debugging
      console.error('Error transforming operations:', error, { op1, op2 });
      
      // Return original operation as fallback
      return { ...op1 };
    }
  }

  /**
   * Apply operation to document content
   */
  static apply(doc: string, op: Operation): string {
    try {
      switch (op.type) {
        case 'insert':
          // Ensure position is within bounds
          const insertPosition = Math.max(0, Math.min(op.position, doc.length));
          return doc.slice(0, insertPosition) + op.text + doc.slice(insertPosition);
          
        case 'delete':
          // Ensure position and length are within bounds
          const deletePosition = Math.max(0, Math.min(op.position, doc.length));
          const deleteLength = Math.max(0, Math.min(op.length, doc.length - deletePosition));
          return doc.slice(0, deletePosition) + doc.slice(deletePosition + deleteLength);
          
        case 'replace':
          // Ensure position and length are within bounds
          const replacePosition = Math.max(0, Math.min(op.position, doc.length));
          const replaceLength = Math.max(0, Math.min(op.length, doc.length - replacePosition));
          return doc.slice(0, replacePosition) + op.text + doc.slice(replacePosition + replaceLength);
          
        default:
          throw new Error(`Unsupported operation type: ${(op as any).type}`);
      }
    } catch (error) {
      console.error('Error applying operation:', error, { operation: op, document: doc });
      return doc; // Return original document on error
    }
  }

  /**
   * Compose two sequential operations into a single operation
   */
  static compose(op1: Operation, op2: Operation): Operation {
    if (op1.type === 'insert' && op2.type === 'insert' && op1.userId === op2.userId) {
      // Sequential inserts at the same position by the same user
      if (op2.position === op1.position + op1.text.length) {
        return {
          type: 'insert',
          position: op1.position,
          text: op1.text + op2.text,
          userId: op1.userId,
          timestamp: op2.timestamp // Use latest timestamp
        };
      }
    }
    
    if (op1.type === 'delete' && op2.type === 'delete' && op1.userId === op2.userId) {
      // Sequential deletes at the same position by the same user
      if (op2.position === op1.position) {
        return {
          type: 'delete',
          position: op1.position,
          length: op1.length + op2.length,
          userId: op1.userId,
          timestamp: op2.timestamp // Use latest timestamp
        };
      }
    }
    
    // For other cases, apply op1 then op2
    return op2;
  }
}