import { OperationalTransform, Operation } from '../collaborative/OperationalTransform';
import { VectorClock } from '../collaborative/VectorClock';

export enum ConflictResolutionStrategy {
  MERGE = 'MERGE',
  LOCAL_FIRST = 'LOCAL_FIRST',
  REMOTE_FIRST = 'REMOTE_FIRST',
  MANUAL = 'MANUAL'
}

export interface Conflict {
  id: string;
  type: string;
  localContent: string;
  remoteContent: string;
  operations?: {
    local: Operation;
    remote: Operation;
  };
  vectorClocks?: {
    local: VectorClock;
    remote: VectorClock;
  };
  tokens?: Array<{
    id: string;
    text: string;
    state: 'ACCEPTED' | 'REJECTED' | 'CONFLICTED';
  }>;
}

export interface ConflictResolution {
  conflictId: string;
  strategy: ConflictResolutionStrategy;
  resolvedContent: string;
  appliedOperations: Operation[];
  mergedState?: Record<string, any>;
}

export class ConflictResolver {
  /**
   * Resolves a conflict using the specified strategy
   */
  async resolveConflict(
    conflict: Conflict,
    strategy: ConflictResolutionStrategy,
    manualMerge?: string
  ): Promise<ConflictResolution> {
    switch (strategy) {
      case ConflictResolutionStrategy.MERGE:
        return this.mergeChanges(conflict);
      
      case ConflictResolutionStrategy.LOCAL_FIRST:
        return this.prioritizeLocal(conflict);
        
      case ConflictResolutionStrategy.REMOTE_FIRST:
        return this.prioritizeRemote(conflict);
        
      case ConflictResolutionStrategy.MANUAL:
        if (!manualMerge) {
          throw new Error('Manual merge requires merged content');
        }
        return this.applyManualMerge(conflict, manualMerge);
        
      default:
        throw new Error(`Unsupported resolution strategy: ${strategy}`);
    }
  }
  
  /**
   * Merges changes using operational transforms
   */
  private async mergeChanges(conflict: Conflict): Promise<ConflictResolution> {
    if (!conflict.operations) {
      // If operations aren't available, fallback to a text-based merge
      return this.textBasedMerge(conflict);
    }
    
    // Create a base document by reversing the local operation
    const baseContent = this.reconstructBaseContent(conflict.localContent, conflict.operations.local);
    
    // Transform remote operation against local operation
    const transformedRemote = OperationalTransform.transform(
      conflict.operations.remote,
      conflict.operations.local
    );
    
    // Apply transformed remote operation to local content
    const resolvedContent = OperationalTransform.apply(conflict.localContent, transformedRemote);
    
    return {
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.MERGE,
      resolvedContent,
      appliedOperations: [conflict.operations.local, transformedRemote]
    };
  }
  
  /**
   * Reconstructs the base content before an operation was applied
   */
  private reconstructBaseContent(currentContent: string, operation: Operation): string {
    // Implement the inverse of each operation type
    if (operation.type === 'insert') {
      return currentContent.slice(0, operation.position) + 
             currentContent.slice(operation.position + operation.text.length);
    } 
    else if (operation.type === 'delete') {
      // We don't have the deleted text, so we can't reconstruct perfectly
      // This is a limitation of this approach
      return currentContent;
    }
    else if (operation.type === 'replace') {
      // Again, without the original text, we can't perfectly reconstruct
      return currentContent;
    }
    return currentContent;
  }
  
  /**
   * Fallback text-based merge when operations aren't available
   */
  private async textBasedMerge(conflict: Conflict): Promise<ConflictResolution> {
    // Very simple text-based merge strategy
    // In a real implementation, you'd use a more sophisticated diff/merge algorithm
    
    // For this simplified example, we'll just append unique content from remote
    // to the end of local content if it seems to be an addition
    if (conflict.remoteContent.length > conflict.localContent.length && 
        conflict.remoteContent.includes(conflict.localContent)) {
      const uniqueContent = conflict.remoteContent.replace(conflict.localContent, '');
      const resolvedContent = conflict.localContent + uniqueContent;
      
      return {
        conflictId: conflict.id,
        strategy: ConflictResolutionStrategy.MERGE,
        resolvedContent,
        appliedOperations: []
      };
    }
    
    // If we can't determine a good merge, default to local content
    return this.prioritizeLocal(conflict);
  }
  
  /**
   * Prioritizes local content over remote
   */
  private async prioritizeLocal(conflict: Conflict): Promise<ConflictResolution> {
    return {
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.LOCAL_FIRST,
      resolvedContent: conflict.localContent,
      appliedOperations: conflict.operations ? [conflict.operations.local] : []
    };
  }
  
  /**
   * Prioritizes remote content over local
   */
  private async prioritizeRemote(conflict: Conflict): Promise<ConflictResolution> {
    return {
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.REMOTE_FIRST,
      resolvedContent: conflict.remoteContent,
      appliedOperations: conflict.operations ? [conflict.operations.remote] : []
    };
  }
  
  /**
   * Applies a manually merged content
   */
  private async applyManualMerge(conflict: Conflict, manualMerge: string): Promise<ConflictResolution> {
    return {
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.MANUAL,
      resolvedContent: manualMerge,
      appliedOperations: [] // We don't track specific operations for manual merge
    };
  }
}