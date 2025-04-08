import { Conflict, VersionedOperation } from '../collaborative/types';

/**
 * Interface for a service that provides conflict resolution strategies
 */
export interface ConflictResolutionProvider {
  /**
   * Resolve a conflict between operations
   * @param conflict The conflict to resolve
   * @returns A new operation that resolves the conflict
   */
  resolveConflict(conflict: Conflict): Promise<VersionedOperation>;
  
  /**
   * Suggest a resolution strategy for a conflict
   * @param conflict The conflict to suggest a strategy for
   * @returns The name of the suggested resolution strategy
   */
  suggestResolutionStrategy(conflict: Conflict): Promise<string>;
}

/**
 * Implementation of the ConflictResolutionProvider
 */
export class DefaultConflictResolutionProvider implements ConflictResolutionProvider {
  /**
   * Resolve a conflict between operations
   * @param conflict The conflict to resolve
   * @returns A new operation that resolves the conflict
   */
  async resolveConflict(conflict: Conflict): Promise<VersionedOperation> {
    // Choose a strategy based on the conflict type
    const strategy = await this.suggestResolutionStrategy(conflict);
    
    switch (strategy) {
      case 'merge':
        return this.mergeOperations(conflict);
      case 'take-first':
        return conflict.operations[0];
      case 'take-second':
        return conflict.operations[1];
      default:
        // Default to merging
        return this.mergeOperations(conflict);
    }
  }
  
  /**
   * Suggest a resolution strategy for a conflict
   * @param conflict The conflict to suggest a strategy for
   * @returns The name of the suggested resolution strategy
   */
  async suggestResolutionStrategy(conflict: Conflict): Promise<string> {
    // Simple strategy selection logic
    // In a real implementation, this would be more sophisticated
    
    if (conflict.type === 'TEXT_EDIT') {
      // Text edits can often be merged
      return 'merge';
    } else if (conflict.type === 'FORMAT') {
      // Format conflicts can also often be merged unless they affect the same attributes
      return 'merge';
    } else if (conflict.type === 'DELETE_MODIFIED') {
      // For delete conflicts, prefer the non-delete operation
      const hasDelete = conflict.operations.some(op => op.type === 'delete');
      const hasNonDelete = conflict.operations.some(op => op.type !== 'delete');
      
      if (hasDelete && hasNonDelete) {
        // Take the non-delete operation
        const index = conflict.operations.findIndex(op => op.type !== 'delete');
        return index === 0 ? 'take-first' : 'take-second';
      }
    }
    
    // Default to the first operation
    return 'take-first';
  }
  
  /**
   * Merge two operations
   * @param conflict The conflict containing operations to merge
   * @returns A merged operation
   */
  private mergeOperations(conflict: Conflict): VersionedOperation {
    const [op1, op2] = conflict.operations;
    
    // Create a new operation with the latest version
    const mergedOp: VersionedOperation = {
      id: `merged-${op1.id}-${op2.id}`,
      documentId: op1.documentId,
      userId: op1.userId,
      version: Math.max(op1.version, op2.version) + 1,
      timestamp: Date.now(),
      position: Math.min(op1.position || 0, op2.position || 0),
      type: 'replace',
      // Merge other properties as needed
      metadata: {
        mergedFrom: [op1.id, op2.id],
        mergeStrategy: 'text-merge'
      }
    };
    
    // The specific merge logic would depend on the operation types
    // For text operations, you might concatenate or intelligently merge text
    // For now, we'll use a simple approach
    
    if (op1.type === 'insert' && op2.type === 'insert') {
      // For two inserts, concatenate the text
      mergedOp.text = (op1.text || '') + (op2.text || '');
    } else if (op1.type === 'replace' && op2.type === 'replace') {
      // For replacements, use a simplified merge approach
      // In a real implementation, this would be more sophisticated
      mergedOp.text = op1.text || op2.text || '';
    } else {
      // Default to using the first operation's text
      mergedOp.text = op1.text || '';
    }
    
    return mergedOp;
  }
}

export default new DefaultConflictResolutionProvider();