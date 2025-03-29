import { OperationalTransform, Operation } from '../collaborative/OperationalTransform';
import { VectorClock } from '../collaborative/VectorClock';
import { MetricsCollector } from '../services/metrics/MetricsCollector';
import { EventStore } from '../collaboration/events/EventStore';

export enum ConflictResolutionStrategy {
  MERGE = 'MERGE',
  LOCAL_FIRST = 'LOCAL_FIRST',
  REMOTE_FIRST = 'REMOTE_FIRST',
  MANUAL = 'MANUAL'
}

export enum ConflictType {
  TEXT_EDIT = 'TEXT_EDIT',
  FORMAT = 'FORMAT',
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  STRUCTURAL = 'STRUCTURAL'
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
  resolvedEvents?: any[];
  resolvedBy?: string;
}

export interface ConflictResolutionResult {
  success: boolean;
  resolvedEvents?: any[];
  error?: Error;
}

export class ConflictResolver {
  constructor(
    private eventStore?: EventStore,
    private metricsCollector?: MetricsCollector,
    private nodeId: string = 'default-node'
  ) {}

  /**
   * Resolves a conflict using the specified strategy
   */
  async resolveConflict(
    conflict: Conflict,
    strategy: ConflictResolutionStrategy,
    options?: {
      manualMerge?: string;
      userId?: string;
    }
  ): Promise<ConflictResolution> {
    const startTime = performance.now();
    
    try {
      // First check if we have token-level data and the strategy is MERGE
      if (conflict.tokens && strategy === ConflictResolutionStrategy.MERGE) {
        return this.resolveTokenConflicts(conflict);
      }
      
      let resolution: ConflictResolution;
      
      switch (strategy) {
        case ConflictResolutionStrategy.MERGE:
          resolution = await this.mergeChanges(conflict);
          break;
        
        case ConflictResolutionStrategy.LOCAL_FIRST:
          resolution = await this.prioritizeLocal(conflict);
          break;
          
        case ConflictResolutionStrategy.REMOTE_FIRST:
          resolution = await this.prioritizeRemote(conflict);
          break;
          
        case ConflictResolutionStrategy.MANUAL:
          if (!options?.manualMerge) {
            throw new Error('Manual merge requires merged content');
          }
          resolution = await this.applyManualMerge(conflict, options.manualMerge);
          break;
          
        default:
          throw new Error(`Unsupported resolution strategy: ${strategy}`);
      }
      
      // Add resolvedBy if userId is provided
      if (options?.userId) {
        resolution.resolvedBy = options.userId;
      }
      
      // Track metrics if collector is available
      if (this.metricsCollector) {
        const duration = performance.now() - startTime;
        await this.metricsCollector.recordValue('conflict.resolution.duration', duration, {
          strategy,
          conflictType: conflict.type,
          hasTokens: conflict.tokens ? 'true' : 'false'
        });
        
        await this.metricsCollector.track('conflict.resolution.complete', {
          strategy,
          conflictType: conflict.type,
          resolvedBy: options?.userId || 'system'
        });
      }
      
      return resolution;
    } catch (error) {
      // Track error metrics if collector is available
      if (this.metricsCollector) {
        await this.metricsCollector.track('conflict.resolution.error', {
          strategy,
          conflictType: conflict.type,
          error: error.message
        });
      }
      
      throw error;
    }
  }
  
  /**
   * Apply a resolution to create events and update the document
   */
  async applyResolution(documentId: string, resolution: ConflictResolution): Promise<ConflictResolutionResult> {
    try {
      // If we don't have an event store, we can't create events
      if (!this.eventStore || !resolution.resolvedEvents) {
        return {
          success: true,
          resolvedEvents: []
        };
      }
      
      // Create events for each resolved event
      const events = [];
      for (const event of resolution.resolvedEvents) {
        const result = await this.eventStore.appendEvent(event);
        events.push(result);
      }
      
      // Track metrics
      if (this.metricsCollector) {
        await this.metricsCollector.incrementCounter('conflict.resolution.applied', {
          documentId,
          strategy: resolution.strategy
        });
      }
      
      return {
        success: true,
        resolvedEvents: events
      };
    } catch (error) {
      // Track error metrics
      if (this.metricsCollector) {
        await this.metricsCollector.track('conflict.resolution.apply.error', {
          documentId,
          error: error.message
        });
      }
      
      return {
        success: false,
        error
      };
    }
  }
  
  /**
   * Get remote events to help with resolving conflicts
   */
  async getRemoteEvents(documentId: string, since: number): Promise<any[]> {
    if (!this.eventStore) {
      return [];
    }
    
    try {
      const events = await this.eventStore.getEvents(documentId, since);
      if (this.metricsCollector) {
        await this.metricsCollector.recordValue('conflict.remote_events.count', events.length, {
          documentId
        });
      }
      return events;
    } catch (error) {
      if (this.metricsCollector) {
        await this.metricsCollector.track('conflict.remote_events.error', {
          documentId,
          error: error.message
        });
      }
      return [];
    }
  }
  
  /**
   * Resolves conflicts at the token level
   */
  private async resolveTokenConflicts(conflict: Conflict): Promise<ConflictResolution> {
    if (!conflict.tokens) {
      // Fallback to traditional merge if token data isn't available
      return this.mergeChanges(conflict);
    }
    
    // Process token states to build resolved content
    let resolvedContent = '';
    const acceptedTokens: string[] = [];
    const rejectedTokens: string[] = [];
    
    for (const token of conflict.tokens) {
      if (token.state === 'ACCEPTED') {
        resolvedContent += token.text;
        acceptedTokens.push(token.id);
      } else if (token.state === 'CONFLICTED') {
        // For conflicted tokens, prioritize local content
        const localMatch = conflict.localContent.includes(token.text);
        if (localMatch) {
          resolvedContent += token.text;
        }
      } else if (token.state === 'REJECTED') {
        rejectedTokens.push(token.id);
        // Don't add rejected tokens to resolved content
      }
    }
    
    return {
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.MERGE,
      resolvedContent,
      appliedOperations: [],
      mergedState: {
        acceptedTokens,
        rejectedTokens,
        tokenStats: {
          accepted: acceptedTokens.length,
          rejected: rejectedTokens.length,
          conflicted: conflict.tokens.filter(t => t.state === 'CONFLICTED').length
        }
      }
    };
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