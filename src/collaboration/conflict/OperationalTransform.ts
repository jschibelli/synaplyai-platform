export interface Operation {
  type: 'insert' | 'delete' | 'retain';
  position: number;
  content?: string;
  length?: number;
}

export class OperationalTransform {
  /**
   * Transforms two operations to be applied in parallel
   * @param op1 First operation
   * @param op2 Second operation
   * @returns Pair of transformed operations
   */
  transform(op1: Operation, op2: Operation): [Operation, Operation] {
    // Handle insert vs insert
    if (op1.type === 'insert' && op2.type === 'insert') {
      if (op1.position < op2.position) {
        // op1 inserts before op2 - adjust op2's position
        return [op1, { ...op2, position: op2.position + op1.content!.length }];
      } else if (op1.position > op2.position) {
        // op2 inserts before op1 - adjust op1's position
        return [{ ...op1, position: op1.position + op2.content!.length }, op2];
      } else {
        // Same position - use client IDs to break tie (client with lower ID goes first)
        if ((op1 as any).clientId < (op2 as any).clientId) {
          return [op1, { ...op2, position: op2.position + op1.content!.length }];
        } else {
          return [{ ...op1, position: op1.position + op2.content!.length }, op2];
        }
      }
    } 
    
    // Handle delete vs delete
    else if (op1.type === 'delete' && op2.type === 'delete') {
      if (op1.position < op2.position) {
        // op1 deletes before op2 - adjust op2's position
        if (op1.position + op1.length! <= op2.position) {
          // No overlap
          return [op1, { ...op2, position: op2.position - op1.length! }];
        } else if (op1.position + op1.length! >= op2.position + op2.length!) {
          // op1 completely contains op2
          return [
            { ...op1, length: op1.length! - op2.length! }, 
            { type: 'retain', position: op2.position, length: 0 }
          ];
        } else {
          // Partial overlap - op1 deletes part of what op2 deletes
          const overlap = (op1.position + op1.length!) - op2.position;
          return [
            op1,
            { ...op2, position: op1.position, length: op2.length! - overlap }
          ];
        }
      } else if (op1.position > op2.position) {
        // op2 deletes before op1 - handle symmetrically
        const [transformedOp2, transformedOp1] = this.transform(op2, op1);
        return [transformedOp1, transformedOp2];
      } else {
        // Same position - take longest delete or combine them
        if (op1.length! === op2.length!) {
          // Both delete the same range
          return [
            op1, 
            { type: 'retain', position: op2.position, length: 0 }
          ];
        } else if (op1.length! > op2.length!) {
          // op1 deletes more
          return [
            { ...op1, length: op1.length! - op2.length! },
            { type: 'retain', position: op2.position, length: 0 }
          ];
        } else {
          // op2 deletes more
          return [
            { type: 'retain', position: op1.position, length: 0 },
            { ...op2, length: op2.length! - op1.length! }
          ];
        }
      }
    } 
    
    // Handle insert vs delete
    else if (op1.type === 'insert' && op2.type === 'delete') {
      if (op1.position <= op2.position) {
        // op1 inserts before or at op2's position
        return [op1, { ...op2, position: op2.position + op1.content!.length }];
      } else if (op1.position >= op2.position + op2.length!) {
        // op1 inserts after op2's deletion range
        return [{ ...op1, position: op1.position - op2.length! }, op2];
      } else {
        // op1 inserts within op2's deletion range - split op2's delete
        return [
          { ...op1, position: op2.position },
          { 
            ...op2, 
            length: op2.length! + op1.content!.length 
          }
        ];
      }
    } 
    
    // Handle delete vs insert
    else if (op1.type === 'delete' && op2.type === 'insert') {
      // Switch arguments and reverse result
      const [transformedOp2, transformedOp1] = this.transform(op2, op1);
      return [transformedOp1, transformedOp2];
    } 
    
    // Handle retain operations
    else if (op1.type === 'retain' && op2.type === 'retain') {
      return [op1, op2]; // No transformation needed
    } else if (op1.type === 'retain') {
      return [op1, op2]; // op1 does nothing, no transformation needed
    } else if (op2.type === 'retain') {
      return [op1, op2]; // op2 does nothing, no transformation needed
    }

    // Default case - should not happen with valid operations
    return [op1, op2];
  }

  /**
   * Composes two sequential operations into a single operation
   * @param op1 First operation to apply
   * @param op2 Second operation to apply
   * @returns Combined operation with same effect as applying op1 then op2
   */
  compose(op1: Operation, op2: Operation): Operation {
    // Special cases for composing operations
    if (op1.type === 'insert' && op2.type === 'insert' && 
        op1.position + op1.content!.length === op2.position) {
      // Sequential inserts that can be combined
      return {
        type: 'insert',
        position: op1.position,
        content: op1.content + op2.content
      };
    } 
    
    else if (op1.type === 'delete' && op2.type === 'delete' && 
             op2.position === op1.position) {
      // Sequential deletes that can be combined
      return {
        type: 'delete',
        position: op1.position,
        length: op1.length! + op2.length!
      };
    }
    
    else if (op1.type === 'retain' && op2.type !== 'retain') {
      // Retain followed by a real operation - just use op2
      return op2;
    }
    
    else if (op1.type !== 'retain' && op2.type === 'retain') {
      // Real operation followed by retain - just use op1
      return op1;
    }
    
    else if (op1.type === 'retain' && op2.type === 'retain') {
      // Both retains - combine lengths
      return {
        type: 'retain',
        position: op1.position,
        length: (op1.length || 0) + (op2.length || 0)
      };
    }

    // For more complex cases, we would need a more sophisticated composition algorithm
    // For now, just return op2 which is a reasonable fallback for many cases
    return op2;
  }

  /**
   * Applies an operation to a document
   * @param doc Document text before operation
   * @param op Operation to apply
   * @returns New document text after applying operation
   */
  applyOperation(doc: string, op: Operation): string {
    switch (op.type) {
      case 'insert':
        if (!op.content) return doc;
        return doc.slice(0, op.position) + op.content + doc.slice(op.position);
      
      case 'delete':
        if (!op.length) return doc;
        return doc.slice(0, op.position) + doc.slice(op.position + op.length);
      
      case 'retain':
        return doc;
      
      default:
        return doc;
    }
  }

  /**
   * Inverts an operation so it can be undone
   * @param op Operation to invert
   * @returns Inverse operation that undoes the effect of op
   */
  invert(op: Operation): Operation {
    switch (op.type) {
      case 'insert':
        return {
          type: 'delete',
          position: op.position,
          length: op.content!.length
        };
      
      case 'delete':
        // Note: To fully implement this, we would need the deleted content
        // For now, we return a placeholder that can be filled in by the caller
        return {
          type: 'insert',
          position: op.position,
          content: '' // Caller must fill in the deleted content
        };
      
      case 'retain':
        return {
          type: 'retain',
          position: op.position,
          length: op.length
        };
      
      default:
        return op;
    }
  }
}