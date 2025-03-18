import { Conflict, ConflictType } from './ConflictDetector';
import { DocumentEvent } from '../events/types';
import { ComplianceLogger } from '../../compliance/logger';
import { MetricsCollector } from '../../metrics/collector';

/**
 * Enum for resolution strategies
 */
export enum ResolutionStrategy {
  LOCAL_FIRST = 'local_first',
  REMOTE_FIRST = 'remote_first',
  TIMESTAMP_BASED = 'timestamp_based',
  MERGE = 'merge',
  CUSTOM = 'custom',
  MANUAL = 'manual'
}

/**
 * Interface for resolution result
 */
export interface ResolutionResult {
  strategy: ResolutionStrategy;
  resolvedEvents: DocumentEvent[];
  description: string;
}

/**
 * Resolver for document conflicts between concurrent operations
 */
export class ConflictResolver {
  constructor(private metricsCollector: MetricsCollector) {}
  
  /**
   * Resolves a conflict using the appropriate strategy
   */
  async resolveConflict(conflict: Conflict): Promise<ResolutionResult> {
    const startTime = performance.now();
    
    try {
      // Select the resolution strategy based on conflict type
      const strategy = this.selectResolutionStrategy(conflict);
      
      // Apply the selected strategy
      const result = await this.applyResolutionStrategy(conflict, strategy);
      
      // Record resolution metrics
      this.metricsCollector.increment('conflict.resolved', 1);
      this.metricsCollector.track('conflict.resolution', 1, {
        type: conflict.type,
        strategy: result.strategy,
        eventCount: result.resolvedEvents.length
      });
      
      // Log the resolution
      await ComplianceLogger.log({
        eventType: 'document.conflict.resolved',
        resourceId: conflict.localEvent.documentId,
        description: `Conflict resolved: ${conflict.description}`,
        metadata: {
          conflictType: conflict.type,
          strategy: result.strategy,
          severity: conflict.severity
        }
      });
      
      return result;
    } finally {
      const duration = performance.now() - startTime;
      this.metricsCollector.recordLatency('conflict.resolution.time', duration);
    }
  }
  
  /**
   * Selects the appropriate resolution strategy based on conflict type
   */
  private selectResolutionStrategy(conflict: Conflict): ResolutionStrategy {
    switch (conflict.type) {
      case ConflictType.TEXT_EDIT:
        return ResolutionStrategy.MERGE; // Try to merge text edits
      
      case ConflictType.FORMAT:
        return ResolutionStrategy.TIMESTAMP_BASED; // Use timestamps for format conflicts
      
      case ConflictType.DELETE_MODIFIED:
        return ResolutionStrategy.MANUAL; // User should decide on delete vs modify
      
      case ConflictType.STRUCTURAL:
        return ResolutionStrategy.TIMESTAMP_BASED; // Use timestamps for structural changes
      
      case ConflictType.MOVE_MODIFIED:
        return ResolutionStrategy.REMOTE_FIRST; // Prioritize edits over moves
      
      default:
        return ResolutionStrategy.LOCAL_FIRST; // Default to local first
    }
  }
  
  /**
   * Applies the selected resolution strategy to the conflict
   */
  private async applyResolutionStrategy(
    conflict: Conflict, 
    strategy: ResolutionStrategy
  ): Promise<ResolutionResult> {
    switch (strategy) {
      case ResolutionStrategy.LOCAL_FIRST:
        return this.applyLocalFirstStrategy(conflict);
      
      case ResolutionStrategy.REMOTE_FIRST:
        return this.applyRemoteFirstStrategy(conflict);
      
      case ResolutionStrategy.TIMESTAMP_BASED:
        return this.applyTimestampBasedStrategy(conflict);
      
      case ResolutionStrategy.MERGE:
        return this.applyMergeStrategy(conflict);
      
      case ResolutionStrategy.CUSTOM:
        return this.applyCustomStrategy(conflict);
      
      case ResolutionStrategy.MANUAL:
        return this.applyManualStrategy(conflict);
      
      default:
        // Fallback to local first
        return this.applyLocalFirstStrategy(conflict);
    }
  }
  
  /**
   * Prioritizes local changes over remote changes
   */
  private applyLocalFirstStrategy(conflict: Conflict): ResolutionResult {
    return {
      strategy: ResolutionStrategy.LOCAL_FIRST,
      resolvedEvents: [conflict.localEvent],
      description: `Local changes prioritized over remote changes for ${conflict.type} conflict`
    };
  }
  
  /**
   * Prioritizes remote changes over local changes
   */
  private applyRemoteFirstStrategy(conflict: Conflict): ResolutionResult {
    return {
      strategy: ResolutionStrategy.REMOTE_FIRST,
      resolvedEvents: [conflict.remoteEvent],
      description: `Remote changes prioritized over local changes for ${conflict.type} conflict`
    };
  }
  
  /**
   * Uses timestamp comparison to determine priority
   */
  private applyTimestampBasedStrategy(conflict: Conflict): ResolutionResult {
    const localTime = conflict.localEvent.timestamp || 0;
    const remoteTime = conflict.remoteEvent.timestamp || 0;
    
    if (localTime >= remoteTime) {
      return {
        strategy: ResolutionStrategy.TIMESTAMP_BASED,
        resolvedEvents: [conflict.localEvent],
        description: `Local changes prioritized based on timestamp (${localTime} >= ${remoteTime})`
      };
    } else {
      return {
        strategy: ResolutionStrategy.TIMESTAMP_BASED,
        resolvedEvents: [conflict.remoteEvent],
        description: `Remote changes prioritized based on timestamp (${remoteTime} > ${localTime})`
      };
    }
  }
  
  /**
   * Attempts to merge changes where possible
   */
  private applyMergeStrategy(conflict: Conflict): ResolutionResult {
    // For text edits, try to create merged operations
    if (conflict.type === ConflictType.TEXT_EDIT) {
      try {
        const mergedEvent = this.mergeTextEvents(conflict.localEvent, conflict.remoteEvent);
        return {
          strategy: ResolutionStrategy.MERGE,
          resolvedEvents: [mergedEvent],
          description: 'Text edits merged successfully'
        };
      } catch (error) {
        // If merge fails, fall back to timestamp-based resolution
        return this.applyTimestampBasedStrategy(conflict);
      }
    }
    
    // For format conflicts, merge the attributes
    if (conflict.type === ConflictType.FORMAT) {
      try {
        const mergedEvent = this.mergeFormatEvents(conflict.localEvent, conflict.remoteEvent);
        return {
          strategy: ResolutionStrategy.MERGE,
          resolvedEvents: [mergedEvent],
          description: 'Format attributes merged successfully'
        };
      } catch (error) {
        // If merge fails, fall back to timestamp-based resolution
        return this.applyTimestampBasedStrategy(conflict);
      }
    }
    
    // For other conflict types, fall back to timestamp-based resolution
    return this.applyTimestampBasedStrategy(conflict);
  }
  
  /**
   * Applies custom resolution logic based on document/tenant policies
   */
  private applyCustomStrategy(conflict: Conflict): ResolutionResult {
    // In a real implementation, this would contain custom logic based on
    // document type, tenant policies, or other business rules
    
    // For now, fall back to timestamp-based resolution
    return this.applyTimestampBasedStrategy(conflict);
  }
  
  /**
   * Marks the conflict for manual resolution by a user
   */
  private applyManualStrategy(conflict: Conflict): ResolutionResult {
    // In a real implementation, this would enqueue the conflict for manual resolution
    // and potentially return a temporary resolution
    
    // For now, fall back to timestamp-based resolution as a temporary measure
    return {
      strategy: ResolutionStrategy.MANUAL,
      resolvedEvents: [], // No events - requires manual intervention
      description: `Conflict requires manual resolution: ${conflict.description}`
    };
  }
  
  /**
   * Helper method to merge text editing events
   */
  private mergeTextEvents(localEvent: DocumentEvent, remoteEvent: DocumentEvent): DocumentEvent {
    // This is a simplified implementation of text merging
    // In a real implementation, you would use a more sophisticated algorithm
    // such as operational transformation or differential synchronization
    
    if (localEvent.type !== remoteEvent.type) {
      throw new Error('Cannot merge events of different types');
    }
    
    // Create a new event that combines both changes
    // This is a very simplified approach
    return {
      ...localEvent,
      vectorClock: this.mergeVectorClocks(
        localEvent.vectorClock || {},
        remoteEvent.vectorClock || {}
      )
    };
  }
  
  /**
   * Helper method to merge format events
   */
  private mergeFormatEvents(localEvent: DocumentEvent, remoteEvent: DocumentEvent): DocumentEvent {
    if (!this.isFormatEvent(localEvent) || !this.isFormatEvent(remoteEvent)) {
      throw new Error('Events must be format events');
    }
    
    // Merge format attributes
    const mergedAttributes = {
      ...(remoteEvent.attributes || {}),
      ...(localEvent.attributes || {})
    };
    
    // Create a new event with merged attributes
    return {
      ...localEvent,
      attributes: mergedAttributes,
      vectorClock: this.mergeVectorClocks(
        localEvent.vectorClock || {},
        remoteEvent.vectorClock || {}
      )
    };
  }
  
  /**
   * Helper to merge vector clocks
   */
  private mergeVectorClocks(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
    const result = { ...a };
    
    // Take the maximum value for each nodeId
    for (const nodeId in b) {
      result[nodeId] = Math.max(result[nodeId] || 0, b[nodeId]);
    }
    
    return result;
  }
  
  /**
   * Helper to check if an event is a format event
   */
  private isFormatEvent(event: DocumentEvent): boolean {
    return ['FORMAT_APPLIED', 'FORMAT_REMOVED'].includes(event.type);
  }
}