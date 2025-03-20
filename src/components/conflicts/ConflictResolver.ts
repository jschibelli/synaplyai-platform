import { getTenantContext } from '../../lib/tenant-context';
import { ComplianceLogger } from '../../compliance/logger';
import { MetricsCollector } from '../../metrics/collector';
import { BaseEvent, EventStore } from '../../events/EventStore';
import { DocumentCommand, InsertTextCommand, DeleteTextCommand, FormatTextCommand } from '../../commands/CommandRegistry';
import { HybridLogicalClock } from '../../transactions/TransactionManager';

/**
 * Result of a conflict resolution operation
 */
export enum ConflictResolutionResult {
  /** Local operation takes precedence */
  LOCAL_WINS = 'LOCAL_WINS',
  /** Remote operation takes precedence */
  REMOTE_WINS = 'REMOTE_WINS',
  /** Operations are merged */
  MERGED = 'MERGED',
  /** Operations remain conflicted, manual resolution required */
  UNRESOLVED = 'UNRESOLVED'
}

/**
 * Types of conflicts that can occur
 */
export enum ConflictType {
  /** Editing the same text */
  TEXT_EDIT = 'TEXT_EDIT',
  /** Structure/format conflict */
  STRUCTURAL = 'STRUCTURAL',
  /** Deleting content that another user modified */
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  /** Moving content that another user modified */
  MOVE_MODIFIED = 'MOVE_MODIFIED',
  /** Concurrent format changes */
  FORMAT = 'FORMAT'
}

/**
 * A conflict between two operations
 */
export interface Conflict {
  /** Type of conflict detected */
  type: ConflictType;
  /** The local operation */
  local: BaseEvent;
  /** The remote operation */
  remote: BaseEvent;
  /** Region of document affected by local operation */
  localRegion?: { start: number; end: number };
  /** Region of document affected by remote operation */
  remoteRegion?: { start: number; end: number };
}

/**
 * Result of a conflict resolution
 */
export interface ConflictResolution {
  /** Result of the resolution */
  result: ConflictResolutionResult;
  /** The resolved event to apply (if any) */
  resolvedEvent?: BaseEvent;
  /** Reason for the resolution decision */
  reason: string;
  /** Metrics about the conflict for analysis */
  metrics?: {
    /** Time taken to resolve conflict */
    resolutionTimeMs: number;
    /** Complexity score of the conflict (higher = more complex) */
    complexityScore: number;
  };
}

/**
 * Configuration options for conflict resolution
 */
export interface ConflictResolverConfig {
  /** Default strategy to use when strategy isn't specified */
  defaultStrategy: ConflictResolutionStrategy;
  /** Whether to enable automatic conflict resolution */
  enableAutoResolution: boolean;
  /** Maximum number of retries for conflict resolution */
  maxResolutionAttempts: number;
  /** Whether to log all conflicts for compliance */
  logConflictsToCompliance: boolean;
  /** Maximum overlap percentage before requiring manual resolution */
  maxOverlapPercent: number;
}

/**
 * Strategy to use for resolving conflicts
 */
export enum ConflictResolutionStrategy {
  /** Latest timestamp wins */
  LATEST_TIMESTAMP = 'LATEST_TIMESTAMP',
  /** Attempt to merge changes */
  MERGE = 'MERGE',
  /** Split the document at conflict point */
  SPLIT = 'SPLIT',
  /** Always prefer local changes */
  LOCAL_FIRST = 'LOCAL_FIRST',
  /** Always prefer remote changes */
  REMOTE_FIRST = 'REMOTE_FIRST',
  /** Manual resolution required */
  MANUAL = 'MANUAL'
}

/**
 * Conflict resolver that handles conflict detection and resolution
 * for collaborative editing using vector timestamps
 */
export class ConflictResolver {
  private config: ConflictResolverConfig;
  private eventStore: EventStore;
  private metricsCollector: MetricsCollector;
  private clock: HybridLogicalClock;
  
  /**
   * Create a new conflict resolver
   * @param eventStore Event store for accessing events
   * @param metricsCollector Metrics collector for monitoring
   * @param nodeId Node identifier for the HLC
   * @param config Configuration for conflict resolution
   */
  constructor(
    eventStore: EventStore, 
    metricsCollector: MetricsCollector,
    nodeId: string,
    config: Partial<ConflictResolverConfig> = {}
  ) {
    this.eventStore = eventStore;
    this.metricsCollector = metricsCollector;
    this.clock = new HybridLogicalClock(nodeId);
    
    this.config = {
      defaultStrategy: ConflictResolutionStrategy.MERGE,
      enableAutoResolution: true,
      maxResolutionAttempts: 3,
      logConflictsToCompliance: true,
      maxOverlapPercent: 50,
      ...config
    };
  }
  
  /**
   * Detect conflicts between a local event and remote events
   * @param localEvent Local event
   * @param remoteEvents Remote events to check against
   * @returns Array of detected conflicts
   */
  async detectConflicts(
    localEvent: BaseEvent, 
    remoteEvents: BaseEvent[]
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    const startTime = Date.now();
    
    try {
      // Group remote events by type for more efficient comparison
      const eventsByType = this.groupEventsByType(remoteEvents);
      
      // Extract document regions for the local event
      const localRegion = this.getAffectedRegion(localEvent);
      
      // Only check events of the same or conflicting types
      const potentiallyConflicting = this.getPotentiallyConflictingEvents(
        localEvent, 
        eventsByType
      );
      
      for (const remoteEvent of potentiallyConflicting) {
        // Skip events that don't have causal relationship 
        // (e.g., events we've already seen)
        if (this.hasSeenEvent(localEvent, remoteEvent)) {
          continue;
        }
        
        // Extract document regions for the remote event
        const remoteRegion = this.getAffectedRegion(remoteEvent);
        
        // Check for overlap in document regions
        const hasOverlap = this.regionsOverlap(localRegion, remoteRegion);
        
        if (hasOverlap) {
          // Determine conflict type
          const conflictType = this.getConflictType(localEvent, remoteEvent);
          
          conflicts.push({
            type: conflictType,
            local: localEvent,
            remote: remoteEvent,
            localRegion,
            remoteRegion
          });
        }
      }
      
      // Log conflicts for metrics
      if (conflicts.length > 0) {
        await this.metricsCollector.incrementCounter('conflicts.detected', {
          documentId: localEvent.aggregateId,
          conflictCount: conflicts.length.toString()
        });
        
        // Log to compliance if configured
        if (this.config.logConflictsToCompliance) {
          await this.logConflictToCompliance(conflicts[0], 'detected');
        }
      }
      
      return conflicts;
    } finally {
      // Record time taken for conflict detection
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('conflict.detection.timeMs', duration, {
        documentId: localEvent.aggregateId
      });
    }
  }
  
  /**
   * Resolve a conflict using specified strategy
   * @param conflict Conflict to resolve
   * @param strategy Resolution strategy to apply
   * @returns Resolution result
   */
  async resolveConflict(
    conflict: Conflict, 
    strategy: ConflictResolutionStrategy = this.config.defaultStrategy
  ): Promise<ConflictResolution> {
    const startTime = Date.now();
    let complexityScore = 1;
    
    try {
      // Increase complexity score based on conflict type
      switch (conflict.type) {
        case ConflictType.TEXT_EDIT:
          complexityScore = 1;
          break;
        case ConflictType.FORMAT:
          complexityScore = 2;
          break;
        case ConflictType.DELETE_MODIFIED:
          complexityScore = 3;
          break;
        case ConflictType.STRUCTURAL:
          complexityScore = 4;
          break;
        case ConflictType.MOVE_MODIFIED:
          complexityScore = 5;
          break;
      }
      
      // Record metrics for this conflict
      await this.metricsCollector.recordValue('conflict.complexity', complexityScore, {
        conflictType: conflict.type,
        documentId: conflict.local.aggregateId
      });
      
      // Apply resolution strategy
      switch (strategy) {
        case ConflictResolutionStrategy.LATEST_TIMESTAMP:
          return this.resolveByTimestamp(conflict);
          
        case ConflictResolutionStrategy.MERGE:
          return this.resolveByMerge(conflict);
          
        case ConflictResolutionStrategy.SPLIT:
          return this.resolveBySplit(conflict);
          
        case ConflictResolutionStrategy.LOCAL_FIRST:
          return {
            result: ConflictResolutionResult.LOCAL_WINS,
            resolvedEvent: conflict.local,
            reason: 'Local-first policy applied'
          };
          
        case ConflictResolutionStrategy.REMOTE_FIRST:
          return {
            result: ConflictResolutionResult.REMOTE_WINS,
            resolvedEvent: conflict.remote,
            reason: 'Remote-first policy applied'
          };
          
        case ConflictResolutionStrategy.MANUAL:
          return {
            result: ConflictResolutionResult.UNRESOLVED,
            reason: 'Manual resolution required'
          };
          
        default:
          // Default to timestamp-based resolution
          return this.resolveByTimestamp(conflict);
      }
    } finally {
      // Record resolution time
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('conflict.resolution.timeMs', duration, {
        strategy,
        conflictType: conflict.type,
        documentId: conflict.local.aggregateId
      });
    }
  }
  
  /**
   * Resolve conflict using timestamp comparison
   * @param conflict Conflict to resolve
   * @private
   */
  private resolveByTimestamp(conflict: Conflict): ConflictResolution {
    // Extract vector clocks
    const localClock = conflict.local.vectorClock;
    const remoteClock = conflict.remote.vectorClock;
    
    // Try to determine causality
    const causalRelation = this.compareVectorClocks(localClock, remoteClock);
    
    if (causalRelation > 0) {
      // Local happened after remote and has seen remote changes
      return {
        result: ConflictResolutionResult.LOCAL_WINS,
        resolvedEvent: conflict.local,
        reason: 'Local vector clock is later than remote',
        metrics: {
          resolutionTimeMs: 0,
          complexityScore: 1
        }
      };
    } else if (causalRelation < 0) {
      // Remote happened after local and has seen local changes
      return {
        result: ConflictResolutionResult.REMOTE_WINS,
        resolvedEvent: conflict.remote,
        reason: 'Remote vector clock is later than local',
        metrics: {
          resolutionTimeMs: 0,
          complexityScore: 1
        }
      };
    } else {
      // Concurrent modifications, fall back to HLC timestamp
      const localHLC = conflict.local.timestamp;
      const remoteHLC = conflict.remote.timestamp;
      
      // Compare HLC timestamps
      if (this.clock.compare(localHLC, remoteHLC) > 0) {
        return {
          result: ConflictResolutionResult.LOCAL_WINS,
          resolvedEvent: conflict.local,
          reason: 'Local HLC timestamp is later than remote',
          metrics: {
            resolutionTimeMs: 0,
            complexityScore: 2
          }
        };
      } else {
        return {
          result: ConflictResolutionResult.REMOTE_WINS,
          resolvedEvent: conflict.remote,
          reason: 'Remote HLC timestamp is later than local',
          metrics: {
            resolutionTimeMs: 0,
            complexityScore: 2
          }
        };
      }
    }
  }
  
  /**
   * Resolve conflict by merging changes
   * @param conflict Conflict to resolve
   * @private
   */
  private resolveByMerge(conflict: Conflict): ConflictResolution {
    // Different merge strategies based on conflict type
    switch (conflict.type) {
      case ConflictType.TEXT_EDIT:
        return this.mergeTextEdits(conflict);
        
      case ConflictType.FORMAT:
        return this.mergeFormatChanges(conflict);
        
      case ConflictType.DELETE_MODIFIED:
        // Can't easily merge when content was deleted - prefer modification
        return {
          result: ConflictResolutionResult.REMOTE_WINS,
          resolvedEvent: conflict.remote,
          reason: 'Content was modified while also being deleted, preserving modifications'
        };
        
      case ConflictType.STRUCTURAL:
      case ConflictType.MOVE_MODIFIED:
        // Complex structural conflicts typically need manual resolution
        return {
          result: ConflictResolutionResult.UNRESOLVED,
          reason: 'Structural conflicts require manual resolution'
        };
        
      default:
        // Fall back to timestamp-based resolution
        return this.resolveByTimestamp(conflict);
    }
  }
  
  /**
   * Merge conflicting text edits
   * @param conflict Text edit conflict to merge
   * @private
   */
  private mergeTextEdits(conflict: Conflict): ConflictResolution {
    const localEvent = conflict.local;
    const remoteEvent = conflict.remote;
    
    // Only handle insert-insert conflicts for now
    if (localEvent.type.includes('INSERT_TEXT') && remoteEvent.type.includes('INSERT_TEXT')) {
      // Extract positions and text
      const localPos = (localEvent as any).position;
      const remotePos = (remoteEvent as any).position;
      const localText = (localEvent as any).text;
      const remoteText = (remoteEvent as any).text;
      
      // Simple case: Inserts at exact same position
      if (localPos === remotePos) {
        // Create merged event using both texts
        // Ordering based on user IDs to ensure consistency
        const useLocalFirst = localEvent.userId.localeCompare(remoteEvent.userId) <= 0;
        const mergedText = useLocalFirst 
          ? localText + remoteText 
          : remoteText + localText;
        
        const mergedEvent = {
          ...localEvent,
          text: mergedText,
          position: localPos,
          vectorClock: this.mergeVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock)
        };
        
        return {
          result: ConflictResolutionResult.MERGED,
          resolvedEvent: mergedEvent,
          reason: 'Merged concurrent inserts at same position'
        };
      }
      
      // Check overlap percentage
      const overlapPercent = this.calculateOverlapPercent(conflict.localRegion!, conflict.remoteRegion!);
      
      if (overlapPercent <= this.config.maxOverlapPercent) {
        // If overlap is minimal, create two separate events to apply sequentially
        // This is a special case where we return a sequence of events to apply
        // The CommandRegistry would need to handle this case
        return {
          result: ConflictResolutionResult.UNRESOLVED,
          reason: `Concurrent inserts with ${overlapPercent}% overlap, manual resolution recommended`
        };
      } else {
        // Significant overlap, default to timestamp resolution
        return this.resolveByTimestamp(conflict);
      }
    }
    
    // For all other cases, use timestamp resolution
    return this.resolveByTimestamp(conflict);
  }
  
  /**
   * Merge conflicting format changes
   * @param conflict Format conflict to merge
   * @private
   */
  private mergeFormatChanges(conflict: Conflict): ConflictResolution {
    const localEvent = conflict.local;
    const remoteEvent = conflict.remote;
    
    // Only handle FORMAT_TEXT conflicts
    if (localEvent.type.includes('FORMAT_TEXT') && remoteEvent.type.includes('FORMAT_TEXT')) {
      // Extract attributes
      const localAttrs = (localEvent as any).attributes || {};
      const remoteAttrs = (remoteEvent as any).attributes || {};
      
      // Check for conflicting attributes (same attribute with different values)
      const conflictingKeys = Object.keys(localAttrs).filter(key => 
        key in remoteAttrs && localAttrs[key] !== remoteAttrs[key]
      );
      
      if (conflictingKeys.length === 0) {
        // No direct attribute conflicts, merge all attributes
        const mergedAttributes = {
          ...remoteAttrs,
          ...localAttrs
        };
        
        // Base the merged event on the one with broader range
        const baseEvent = this.getEventWithBroaderRange(localEvent, remoteEvent);
        const mergedEvent = {
          ...baseEvent,
          attributes: mergedAttributes,
          vectorClock: this.mergeVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock)
        };
        
        return {
          result: ConflictResolutionResult.MERGED,
          resolvedEvent: mergedEvent,
          reason: 'Merged compatible formatting changes'
        };
      } else {
        // Attribute conflicts exist, resolve by timestamp
        return this.resolveByTimestamp(conflict);
      }
    }
    
    // For non-format events, use timestamp resolution
    return this.resolveByTimestamp(conflict);
  }
  
  /**
   * Resolve conflict by splitting document at conflict point
   * @param conflict Conflict to resolve
   * @private
   */
  private resolveBySplit(conflict: Conflict): ConflictResolution {
    // This is a complex operation that would typically involve creating
    // a special SPLIT event which the document projector would handle.
    // For simplicity in this implementation, we'll just mark it as unresolved.
    
    return {
      result: ConflictResolutionResult.UNRESOLVED,
      reason: 'Split resolution strategy not fully implemented, requires manual resolution'
    };
  }
  
  /**
   * Compare two vector clocks to determine their relationship
   * @param a First vector clock
   * @param b Second vector clock
   * @returns 1 if a > b, -1 if a < b, 0 if incomparable (concurrent)
   * @private
   */
  private compareVectorClocks(
    a: Record<string, number>,
    b: Record<string, number>
  ): number {
    let aGreater = false;
    let bGreater = false;
    
    // Get all keys from both clocks
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    
    for (const key of allKeys) {
      const aValue = a[key] || 0;
      const bValue = b[key] || 0;
      
      if (aValue > bValue) {
        aGreater = true;
      } else if (bValue > aValue) {
        bGreater = true;
      }
    }
    
    // If a has some values greater than b and none less, a > b
    if (aGreater && !bGreater) {
      return 1;
    }
    
    // If b has some values greater than a and none less, b > a
    if (bGreater && !aGreater) {
      return -1;
    }
    
    // If both have some values greater than the other, or all values are equal,
    // they are concurrent or equal
    return 0;
  }
  
  /**
   * Merge two vector clocks
   * @param a First vector clock
   * @param b Second vector clock
   * @returns Merged vector clock
   * @private
   */
  private mergeVectorClocks(
    a: Record<string, number>,
    b: Record<string, number>
  ): Record<string, number> {
    const result = { ...a };
    
    // Take the max value for each key
    for (const [key, value] of Object.entries(b)) {
      result[key] = Math.max(result[key] || 0, value);
    }
    
    return result;
  }
  
  /**
   * Check if local event has already seen the remote event
   * through vector clock causality
   * @param local Local event
   * @param remote Remote event 
   * @private
   */
  private hasSeenEvent(local: BaseEvent, remote: BaseEvent): boolean {
    const localClock = local.vectorClock;
    const remoteClock = remote.vectorClock;
    
    // If remote's user ID isn't in local's clock, it hasn't been seen
    const remoteUserId = remote.userId;
    if (!(remoteUserId in localClock)) {
      return false;
    }
    
    // If local timestamp for remote user is less than remote's own timestamp,
    // local hasn't seen this specific remote event
    return localClock[remoteUserId] >= remoteClock[remoteUserId];
  }
  
  /**
   * Group events by their type for more efficient conflict detection
   * @param events Events to group
   * @private
   */
  private groupEventsByType(events: BaseEvent[]): Map<string, BaseEvent[]> {
    const result = new Map<string, BaseEvent[]>();
    
    for (const event of events) {
      const type = event.type;
      
      if (!result.has(type)) {
        result.set(type, []);
      }
      
      result.get(type)!.push(event);
    }
    
    return result;
  }
  
  /**
   * Get events that could potentially conflict with the given event
   * @param event Event to check against
   * @param eventsByType Events grouped by type
   * @private
   */
  private getPotentiallyConflictingEvents(
    event: BaseEvent,
    eventsByType: Map<string, BaseEvent[]>
  ): BaseEvent[] {
    const result: BaseEvent[] = [];
    const eventType = event.type;
    
    // Get events of the same type
    if (eventsByType.has(eventType)) {
      result.push(...eventsByType.get(eventType)!);
    }
    
    // Get events that can conflict with this type
    if (eventType.includes('INSERT_TEXT')) {
      // Insert can conflict with other inserts, deletes, and formatting
      this.addEventsOfTypeIfPresent(eventsByType, 'DELETE_TEXT', result);
      this.addEventsOfTypeIfPresent(eventsByType, 'FORMAT_TEXT', result);
    } else if (eventType.includes('DELETE_TEXT')) {
      // Delete can conflict with inserts, other deletes, and formatting
      this.addEventsOfTypeIfPresent(eventsByType, 'INSERT_TEXT', result);
      this.addEventsOfTypeIfPresent(eventsByType, 'FORMAT_TEXT', result);
    } else if (eventType.includes('FORMAT_TEXT')) {
      // Format can conflict with other formats, inserts, and deletes
      this.addEventsOfTypeIfPresent(eventsByType, 'INSERT_TEXT', result);
      this.addEventsOfTypeIfPresent(eventsByType, 'DELETE_TEXT', result);
    }
    
    return result;
  }
  
  /**
   * Add events of a specific type to a result array if present
   * @param eventsByType Events grouped by type
   * @param type Type to add
   * @param result Result array to add to
   * @private
   */
  private addEventsOfTypeIfPresent(
    eventsByType: Map<string, BaseEvent[]>,
    type: string,
    result: BaseEvent[]
  ): void {
    for (const [eventType, events] of eventsByType.entries()) {
      if (eventType.includes(type)) {
        result.push(...events);
      }
    }
  }
  
  /**
   * Get the document region affected by an event
   * @param event Event to analyze
   * @returns Region affected by the event
   * @private
   */
  private getAffectedRegion(event: BaseEvent): { start: number; end: number } {
    const eventType = event.type;
    
    if (eventType.includes('INSERT_TEXT')) {
      const position = (event as any).position;
      const text = (event as any).text || '';
      return { start: position, end: position + text.length };
    } else if (eventType.includes('DELETE_TEXT')) {
      const position = (event as any).position;
      const length = (event as any).length || 0;
      return { start: position, end: position + length };
    } else if (eventType.includes('FORMAT_TEXT')) {
      const position = (event as any).position;
      const length = (event as any).length || 0;
      return { start: position, end: position + length };
    }
    
    // Default to empty region if type is unknown
    return { start: 0, end: 0 };
  }
  
  /**
   * Check if two regions overlap
   * @param a First region
   * @param b Second region
   * @returns Whether the regions overlap
   * @private
   */
  private regionsOverlap(
    a: { start: number; end: number },
    b: { start: number; end: number }
  ): boolean {
    // Empty regions can't overlap
    if (a.start === a.end || b.start === b.end) {
      return false;
    }
    
    // Check for overlap
    return a.start < b.end && b.start < a.end;
  }
  
  /**
   * Calculate percentage of overlap between two regions
   * @param a First region
   * @param b Second region
   * @returns Percentage of overlap (0-100)
   * @private
   */
  private calculateOverlapPercent(
    a: { start: number; end: number },
    b: { start: number; end: number }
  ): number {
    // Calculate overlap
    const overlapStart = Math.max(a.start, b.start);
    const overlapEnd = Math.min(a.end, b.end);
    
    if (overlapStart >= overlapEnd) {
      return 0; // No overlap
    }
    
    const overlapLength = overlapEnd - overlapStart;
    const aLength = a.end - a.start;
    const bLength = b.end - b.start;
    
    // Overlap percentage is based on the smaller of the two regions
    const smallerLength = Math.min(aLength, bLength);
    
    return (overlapLength / smallerLength) * 100;
  }
  
  /**
   * Get the conflict type for two events
   * @param local Local event
   * @param remote Remote event
   * @returns Type of conflict
   * @private
   */
  private getConflictType(local: BaseEvent, remote: BaseEvent): ConflictType {
    const localType = local.type;
    const remoteType = remote.type;
    
    if (localType.includes('INSERT_TEXT') && remoteType.includes('INSERT_TEXT')) {
      return ConflictType.TEXT_EDIT;
    } else if (localType.includes('FORMAT_TEXT') && remoteType.includes('FORMAT_TEXT')) {
      return ConflictType.FORMAT;
    } else if (
      (localType.includes('DELETE_TEXT') && remoteType.includes('INSERT_TEXT')) ||
      (localType.includes('INSERT_TEXT') && remoteType.includes('DELETE_TEXT'))
    ) {
      return ConflictType.DELETE_MODIFIED;
    } else if (
      (localType.includes('DELETE_TEXT') && remoteType.includes('FORMAT_TEXT')) ||
      (localType.includes('FORMAT_TEXT') && remoteType.includes('DELETE_TEXT'))
    ) {
      return ConflictType.DELETE_MODIFIED;
    } else {
      // Default to structural conflict for unknown combinations
      return ConflictType.STRUCTURAL;
    }
  }
  
  /**
   * Get the event with the broader text range
   * @param a First event
   * @param b Second event
   * @returns Event with broader range
   * @private
   */
  private getEventWithBroaderRange(a: BaseEvent, b: BaseEvent): BaseEvent {
    const aRegion = this.getAffectedRegion(a);
    const bRegion = this.getAffectedRegion(b);
    
    const aLength = aRegion.end - aRegion.start;
    const bLength = bRegion.end - bRegion.start;
    
    return aLength >= bLength ? a : b;
  }
  
  /**
   * Log conflict details to compliance log
   * @param conflict Conflict to log
   * @param stage Stage of conflict handling (detected/resolved)
   * @private
   */
  private async logConflictToCompliance(
    conflict: Conflict,
    stage: 'detected' | 'resolved'
  ): Promise<void> {
    await ComplianceLogger.log({
      eventType: `conflict.${stage}`,
      resourceId: conflict.local.aggregateId,
      description: `Document edit conflict ${stage}: ${conflict.type}`,
      metadata: {
        conflictType: conflict.type,
        localEventId: conflict.local.id,
        localEventType: conflict.local.type,
        localUserId: conflict.local.userId,
        remoteEventId: conflict.remote.id,
        remoteEventType: conflict.remote.type,
        remoteUserId: conflict.remote.userId,
        localRegion: conflict.localRegion,
        remoteRegion: conflict.remoteRegion
      }
    });
  }
  
  /**
   * Apply conflict resolution to a document
   * @param documentId Document to update
   * @param resolution Resolution to apply
   * @returns Whether the resolution was applied successfully
   */
  async applyResolution(
    documentId: string,
    resolution: ConflictResolution
  ): Promise<boolean> {
    try {
      // Only apply if there's a resolved event
      if (!resolution.resolvedEvent) {
        return false;
      }
      
      // Apply the resolved event
      await this.eventStore.appendEvent(resolution.resolvedEvent);
      
      // Record metrics for resolution application
      await this.metricsCollector.incrementCounter('conflict.resolution.applied', {
        documentId,
        result: resolution.result
      });
      
      return true;
    } catch (error) {
      console.error('Failed to apply conflict resolution:', error);
      
      //// filepath: d:\ai-dev-projects\ai-create-assistant\src\conflicts\ConflictResolver.ts
import { getTenantContext } from '../lib/tenant-context';
import { ComplianceLogger } from '../compliance/logger';
import { MetricsCollector } from '../metrics/collector';
import { BaseEvent, EventStore } from '../events/EventStore';
import { DocumentCommand, InsertTextCommand, DeleteTextCommand, FormatTextCommand } from '../commands/CommandRegistry';
import { HybridLogicalClock } from '../transactions/TransactionManager';

/**
 * Result of a conflict resolution operation
 */
export enum ConflictResolutionResult {
  /** Local operation takes precedence */
  LOCAL_WINS = 'LOCAL_WINS',
  /** Remote operation takes precedence */
  REMOTE_WINS = 'REMOTE_WINS',
  /** Operations are merged */
  MERGED = 'MERGED',
  /** Operations remain conflicted, manual resolution required */
  UNRESOLVED = 'UNRESOLVED'
}

/**
 * Types of conflicts that can occur
 */
export enum ConflictType {
  /** Editing the same text */
  TEXT_EDIT = 'TEXT_EDIT',
  /** Structure/format conflict */
  STRUCTURAL = 'STRUCTURAL',
  /** Deleting content that another user modified */
  DELETE_MODIFIED = 'DELETE_MODIFIED',
  /** Moving content that another user modified */
  MOVE_MODIFIED = 'MOVE_MODIFIED',
  /** Concurrent format changes */
  FORMAT = 'FORMAT'
}

/**
 * A conflict between two operations
 */
export interface Conflict {
  /** Type of conflict detected */
  type: ConflictType;
  /** The local operation */
  local: BaseEvent;
  /** The remote operation */
  remote: BaseEvent;
  /** Region of document affected by local operation */
  localRegion?: { start: number; end: number };
  /** Region of document affected by remote operation */
  remoteRegion?: { start: number; end: number };
}

/**
 * Result of a conflict resolution
 */
export interface ConflictResolution {
  /** Result of the resolution */
  result: ConflictResolutionResult;
  /** The resolved event to apply (if any) */
  resolvedEvent?: BaseEvent;
  /** Reason for the resolution decision */
  reason: string;
  /** Metrics about the conflict for analysis */
  metrics?: {
    /** Time taken to resolve conflict */
    resolutionTimeMs: number;
    /** Complexity score of the conflict (higher = more complex) */
    complexityScore: number;
  };
}

/**
 * Configuration options for conflict resolution
 */
export interface ConflictResolverConfig {
  /** Default strategy to use when strategy isn't specified */
  defaultStrategy: ConflictResolutionStrategy;
  /** Whether to enable automatic conflict resolution */
  enableAutoResolution: boolean;
  /** Maximum number of retries for conflict resolution */
  maxResolutionAttempts: number;
  /** Whether to log all conflicts for compliance */
  logConflictsToCompliance: boolean;
  /** Maximum overlap percentage before requiring manual resolution */
  maxOverlapPercent: number;
}

/**
 * Strategy to use for resolving conflicts
 */
export enum ConflictResolutionStrategy {
  /** Latest timestamp wins */
  LATEST_TIMESTAMP = 'LATEST_TIMESTAMP',
  /** Attempt to merge changes */
  MERGE = 'MERGE',
  /** Split the document at conflict point */
  SPLIT = 'SPLIT',
  /** Always prefer local changes */
  LOCAL_FIRST = 'LOCAL_FIRST',
  /** Always prefer remote changes */
  REMOTE_FIRST = 'REMOTE_FIRST',
  /** Manual resolution required */
  MANUAL = 'MANUAL'
}

/**
 * Conflict resolver that handles conflict detection and resolution
 * for collaborative editing using vector timestamps
 */
export class ConflictResolver {
  private config: ConflictResolverConfig;
  private eventStore: EventStore;
  private metricsCollector: MetricsCollector;
  private clock: HybridLogicalClock;
  
  /**
   * Create a new conflict resolver
   * @param eventStore Event store for accessing events
   * @param metricsCollector Metrics collector for monitoring
   * @param nodeId Node identifier for the HLC
   * @param config Configuration for conflict resolution
   */
  constructor(
    eventStore: EventStore, 
    metricsCollector: MetricsCollector,
    nodeId: string,
    config: Partial<ConflictResolverConfig> = {}
  ) {
    this.eventStore = eventStore;
    this.metricsCollector = metricsCollector;
    this.clock = new HybridLogicalClock(nodeId);
    
    this.config = {
      defaultStrategy: ConflictResolutionStrategy.MERGE,
      enableAutoResolution: true,
      maxResolutionAttempts: 3,
      logConflictsToCompliance: true,
      maxOverlapPercent: 50,
      ...config
    };
  }
  
  /**
   * Detect conflicts between a local event and remote events
   * @param localEvent Local event
   * @param remoteEvents Remote events to check against
   * @returns Array of detected conflicts
   */
  async detectConflicts(
    localEvent: BaseEvent, 
    remoteEvents: BaseEvent[]
  ): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    const startTime = Date.now();
    
    try {
      // Group remote events by type for more efficient comparison
      const eventsByType = this.groupEventsByType(remoteEvents);
      
      // Extract document regions for the local event
      const localRegion = this.getAffectedRegion(localEvent);
      
      // Only check events of the same or conflicting types
      const potentiallyConflicting = this.getPotentiallyConflictingEvents(
        localEvent, 
        eventsByType
      );
      
      for (const remoteEvent of potentiallyConflicting) {
        // Skip events that don't have causal relationship 
        // (e.g., events we've already seen)
        if (this.hasSeenEvent(localEvent, remoteEvent)) {
          continue;
        }
        
        // Extract document regions for the remote event
        const remoteRegion = this.getAffectedRegion(remoteEvent);
        
        // Check for overlap in document regions
        const hasOverlap = this.regionsOverlap(localRegion, remoteRegion);
        
        if (hasOverlap) {
          // Determine conflict type
          const conflictType = this.getConflictType(localEvent, remoteEvent);
          
          conflicts.push({
            type: conflictType,
            local: localEvent,
            remote: remoteEvent,
            localRegion,
            remoteRegion
          });
        }
      }
      
      // Log conflicts for metrics
      if (conflicts.length > 0) {
        await this.metricsCollector.incrementCounter('conflicts.detected', {
          documentId: localEvent.aggregateId,
          conflictCount: conflicts.length.toString()
        });
        
        // Log to compliance if configured
        if (this.config.logConflictsToCompliance) {
          await this.logConflictToCompliance(conflicts[0], 'detected');
        }
      }
      
      return conflicts;
    } finally {
      // Record time taken for conflict detection
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('conflict.detection.timeMs', duration, {
        documentId: localEvent.aggregateId
      });
    }
  }
  
  /**
   * Resolve a conflict using specified strategy
   * @param conflict Conflict to resolve
   * @param strategy Resolution strategy to apply
   * @returns Resolution result
   */
  async resolveConflict(
    conflict: Conflict, 
    strategy: ConflictResolutionStrategy = this.config.defaultStrategy
  ): Promise<ConflictResolution> {
    const startTime = Date.now();
    let complexityScore = 1;
    
    try {
      // Increase complexity score based on conflict type
      switch (conflict.type) {
        case ConflictType.TEXT_EDIT:
          complexityScore = 1;
          break;
        case ConflictType.FORMAT:
          complexityScore = 2;
          break;
        case ConflictType.DELETE_MODIFIED:
          complexityScore = 3;
          break;
        case ConflictType.STRUCTURAL:
          complexityScore = 4;
          break;
        case ConflictType.MOVE_MODIFIED:
          complexityScore = 5;
          break;
      }
      
      // Record metrics for this conflict
      await this.metricsCollector.recordValue('conflict.complexity', complexityScore, {
        conflictType: conflict.type,
        documentId: conflict.local.aggregateId
      });
      
      // Apply resolution strategy
      switch (strategy) {
        case ConflictResolutionStrategy.LATEST_TIMESTAMP:
          return this.resolveByTimestamp(conflict);
          
        case ConflictResolutionStrategy.MERGE:
          return this.resolveByMerge(conflict);
          
        case ConflictResolutionStrategy.SPLIT:
          return this.resolveBySplit(conflict);
          
        case ConflictResolutionStrategy.LOCAL_FIRST:
          return {
            result: ConflictResolutionResult.LOCAL_WINS,
            resolvedEvent: conflict.local,
            reason: 'Local-first policy applied'
          };
          
        case ConflictResolutionStrategy.REMOTE_FIRST:
          return {
            result: ConflictResolutionResult.REMOTE_WINS,
            resolvedEvent: conflict.remote,
            reason: 'Remote-first policy applied'
          };
          
        case ConflictResolutionStrategy.MANUAL:
          return {
            result: ConflictResolutionResult.UNRESOLVED,
            reason: 'Manual resolution required'
          };
          
        default:
          // Default to timestamp-based resolution
          return this.resolveByTimestamp(conflict);
      }
    } finally {
      // Record resolution time
      const duration = Date.now() - startTime;
      await this.metricsCollector.recordValue('conflict.resolution.timeMs', duration, {
        strategy,
        conflictType: conflict.type,
        documentId: conflict.local.aggregateId
      });
    }
  }
  
  /**
   * Resolve conflict using timestamp comparison
   * @param conflict Conflict to resolve
   * @private
   */
  private resolveByTimestamp(conflict: Conflict): ConflictResolution {
    // Extract vector clocks
    const localClock = conflict.local.vectorClock;
    const remoteClock = conflict.remote.vectorClock;
    
    // Try to determine causality
    const causalRelation = this.compareVectorClocks(localClock, remoteClock);
    
    if (causalRelation > 0) {
      // Local happened after remote and has seen remote changes
      return {
        result: ConflictResolutionResult.LOCAL_WINS,
        resolvedEvent: conflict.local,
        reason: 'Local vector clock is later than remote',
        metrics: {
          resolutionTimeMs: 0,
          complexityScore: 1
        }
      };
    } else if (causalRelation < 0) {
      // Remote happened after local and has seen local changes
      return {
        result: ConflictResolutionResult.REMOTE_WINS,
        resolvedEvent: conflict.remote,
        reason: 'Remote vector clock is later than local',
        metrics: {
          resolutionTimeMs: 0,
          complexityScore: 1
        }
      };
    } else {
      // Concurrent modifications, fall back to HLC timestamp
      const localHLC = conflict.local.timestamp;
      const remoteHLC = conflict.remote.timestamp;
      
      // Compare HLC timestamps
      if (this.clock.compare(localHLC, remoteHLC) > 0) {
        return {
          result: ConflictResolutionResult.LOCAL_WINS,
          resolvedEvent: conflict.local,
          reason: 'Local HLC timestamp is later than remote',
          metrics: {
            resolutionTimeMs: 0,
            complexityScore: 2
          }
        };
      } else {
        return {
          result: ConflictResolutionResult.REMOTE_WINS,
          resolvedEvent: conflict.remote,
          reason: 'Remote HLC timestamp is later than local',
          metrics: {
            resolutionTimeMs: 0,
            complexityScore: 2
          }
        };
      }
    }
  }
  
  /**
   * Resolve conflict by merging changes
   * @param conflict Conflict to resolve
   * @private
   */
  private resolveByMerge(conflict: Conflict): ConflictResolution {
    // Different merge strategies based on conflict type
    switch (conflict.type) {
      case ConflictType.TEXT_EDIT:
        return this.mergeTextEdits(conflict);
        
      case ConflictType.FORMAT:
        return this.mergeFormatChanges(conflict);
        
      case ConflictType.DELETE_MODIFIED:
        // Can't easily merge when content was deleted - prefer modification
        return {
          result: ConflictResolutionResult.REMOTE_WINS,
          resolvedEvent: conflict.remote,
          reason: 'Content was modified while also being deleted, preserving modifications'
        };
        
      case ConflictType.STRUCTURAL:
      case ConflictType.MOVE_MODIFIED:
        // Complex structural conflicts typically need manual resolution
        return {
          result: ConflictResolutionResult.UNRESOLVED,
          reason: 'Structural conflicts require manual resolution'
        };
        
      default:
        // Fall back to timestamp-based resolution
        return this.resolveByTimestamp(conflict);
    }
  }
  
  /**
   * Merge conflicting text edits
   * @param conflict Text edit conflict to merge
   * @private
   */
  private mergeTextEdits(conflict: Conflict): ConflictResolution {
    const localEvent = conflict.local;
    const remoteEvent = conflict.remote;
    
    // Only handle insert-insert conflicts for now
    if (localEvent.type.includes('INSERT_TEXT') && remoteEvent.type.includes('INSERT_TEXT')) {
      // Extract positions and text
      const localPos = (localEvent as any).position;
      const remotePos = (remoteEvent as any).position;
      const localText = (localEvent as any).text;
      const remoteText = (remoteEvent as any).text;
      
      // Simple case: Inserts at exact same position
      if (localPos === remotePos) {
        // Create merged event using both texts
        // Ordering based on user IDs to ensure consistency
        const useLocalFirst = localEvent.userId.localeCompare(remoteEvent.userId) <= 0;
        const mergedText = useLocalFirst 
          ? localText + remoteText 
          : remoteText + localText;
        
        const mergedEvent = {
          ...localEvent,
          text: mergedText,
          position: localPos,
          vectorClock: this.mergeVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock)
        };
        
        return {
          result: ConflictResolutionResult.MERGED,
          resolvedEvent: mergedEvent,
          reason: 'Merged concurrent inserts at same position'
        };
      }
      
      // Check overlap percentage
      const overlapPercent = this.calculateOverlapPercent(conflict.localRegion!, conflict.remoteRegion!);
      
      if (overlapPercent <= this.config.maxOverlapPercent) {
        // If overlap is minimal, create two separate events to apply sequentially
        // This is a special case where we return a sequence of events to apply
        // The CommandRegistry would need to handle this case
        return {
          result: ConflictResolutionResult.UNRESOLVED,
          reason: `Concurrent inserts with ${overlapPercent}% overlap, manual resolution recommended`
        };
      } else {
        // Significant overlap, default to timestamp resolution
        return this.resolveByTimestamp(conflict);
      }
    }
    
    // For all other cases, use timestamp resolution
    return this.resolveByTimestamp(conflict);
  }
  
  /**
   * Merge conflicting format changes
   * @param conflict Format conflict to merge
   * @private
   */
  private mergeFormatChanges(conflict: Conflict): ConflictResolution {
    const localEvent = conflict.local;
    const remoteEvent = conflict.remote;
    
    // Only handle FORMAT_TEXT conflicts
    if (localEvent.type.includes('FORMAT_TEXT') && remoteEvent.type.includes('FORMAT_TEXT')) {
      // Extract attributes
      const localAttrs = (localEvent as any).attributes || {};
      const remoteAttrs = (remoteEvent as any).attributes || {};
      
      // Check for conflicting attributes (same attribute with different values)
      const conflictingKeys = Object.keys(localAttrs).filter(key => 
        key in remoteAttrs && localAttrs[key] !== remoteAttrs[key]
      );
      
      if (conflictingKeys.length === 0) {
        // No direct attribute conflicts, merge all attributes
        const mergedAttributes = {
          ...remoteAttrs,
          ...localAttrs
        };
        
        // Base the merged event on the one with broader range
        const baseEvent = this.getEventWithBroaderRange(localEvent, remoteEvent);
        const mergedEvent = {
          ...baseEvent,
          attributes: mergedAttributes,
          vectorClock: this.mergeVectorClocks(localEvent.vectorClock, remoteEvent.vectorClock)
        };
        
        return {
          result: ConflictResolutionResult.MERGED,
          resolvedEvent: mergedEvent,
          reason: 'Merged compatible formatting changes'
        };
      } else {
        // Attribute conflicts exist, resolve by timestamp
        return this.resolveByTimestamp(conflict);
      }
    }
    
    // For non-format events, use timestamp resolution
    return this.resolveByTimestamp(conflict);
  }
  
  /**
   * Resolve conflict by splitting document at conflict point
   * @param conflict Conflict to resolve
   * @private
   */
  private resolveBySplit(conflict: Conflict): ConflictResolution {
    // This is a complex operation that would typically involve creating
    // a special SPLIT event which the document projector would handle.
    // For simplicity in this implementation, we'll just mark it as unresolved.
    
    return {
      result: ConflictResolutionResult.UNRESOLVED,
      reason: 'Split resolution strategy not fully implemented, requires manual resolution'
    };
  }
  
  /**
   * Compare two vector clocks to determine their relationship
   * @param a First vector clock
   * @param b Second vector clock
   * @returns 1 if a > b, -1 if a < b, 0 if incomparable (concurrent)
   * @private
   */
  private compareVectorClocks(
    a: Record<string, number>,
    b: Record<string, number>
  ): number {
    let aGreater = false;
    let bGreater = false;
    
    // Get all keys from both clocks
    const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
    
    for (const key of allKeys) {
      const aValue = a[key] || 0;
      const bValue = b[key] || 0;
      
      if (aValue > bValue) {
        aGreater = true;
      } else if (bValue > aValue) {
        bGreater = true;
      }
    }
    
    // If a has some values greater than b and none less, a > b
    if (aGreater && !bGreater) {
      return 1;
    }
    
    // If b has some values greater than a and none less, b > a
    if (bGreater && !aGreater) {
      return -1;
    }
    
    // If both have some values greater than the other, or all values are equal,
    // they are concurrent or equal
    return 0;
  }
  
  /**
   * Merge two vector clocks
   * @param a First vector clock
   * @param b Second vector clock
   * @returns Merged vector clock
   * @private
   */
  private mergeVectorClocks(
    a: Record<string, number>,
    b: Record<string, number>
  ): Record<string, number> {
    const result = { ...a };
    
    // Take the max value for each key
    for (const [key, value] of Object.entries(b)) {
      result[key] = Math.max(result[key] || 0, value);
    }
    
    return result;
  }
  
  /**
   * Check if local event has already seen the remote event
   * through vector clock causality
   * @param local Local event
   * @param remote Remote event 
   * @private
   */
  private hasSeenEvent(local: BaseEvent, remote: BaseEvent): boolean {
    const localClock = local.vectorClock;
    const remoteClock = remote.vectorClock;
    
    // If remote's user ID isn't in local's clock, it hasn't been seen
    const remoteUserId = remote.userId;
    if (!(remoteUserId in localClock)) {
      return false;
    }
    
    // If local timestamp for remote user is less than remote's own timestamp,
    // local hasn't seen this specific remote event
    return localClock[remoteUserId] >= remoteClock[remoteUserId];
  }
  
  /**
   * Group events by their type for more efficient conflict detection
   * @param events Events to group
   * @private
   */
  private groupEventsByType(events: BaseEvent[]): Map<string, BaseEvent[]> {
    const result = new Map<string, BaseEvent[]>();
    
    for (const event of events) {
      const type = event.type;
      
      if (!result.has(type)) {
        result.set(type, []);
      }
      
      result.get(type)!.push(event);
    }
    
    return result;
  }
  
  /**
   * Get events that could potentially conflict with the given event
   * @param event Event to check against
   * @param eventsByType Events grouped by type
   * @private
   */
  private getPotentiallyConflictingEvents(
    event: BaseEvent,
    eventsByType: Map<string, BaseEvent[]>
  ): BaseEvent[] {
    const result: BaseEvent[] = [];
    const eventType = event.type;
    
    // Get events of the same type
    if (eventsByType.has(eventType)) {
      result.push(...eventsByType.get(eventType)!);
    }
    
    // Get events that can conflict with this type
    if (eventType.includes('INSERT_TEXT')) {
      // Insert can conflict with other inserts, deletes, and formatting
      this.addEventsOfTypeIfPresent(eventsByType, 'DELETE_TEXT', result);
      this.addEventsOfTypeIfPresent(eventsByType, 'FORMAT_TEXT', result);
    } else if (eventType.includes('DELETE_TEXT')) {
      // Delete can conflict with inserts, other deletes, and formatting
      this.addEventsOfTypeIfPresent(eventsByType, 'INSERT_TEXT', result);
      this.addEventsOfTypeIfPresent(eventsByType, 'FORMAT_TEXT', result);
    } else if (eventType.includes('FORMAT_TEXT')) {
      // Format can conflict with other formats, inserts, and deletes
      this.addEventsOfTypeIfPresent(eventsByType, 'INSERT_TEXT', result);
      this.addEventsOfTypeIfPresent(eventsByType, 'DELETE_TEXT', result);
    }
    
    return result;
  }
  
  /**
   * Add events of a specific type to a result array if present
   * @param eventsByType Events grouped by type
   * @param type Type to add
   * @param result Result array to add to
   * @private
   */
  private addEventsOfTypeIfPresent(
    eventsByType: Map<string, BaseEvent[]>,
    type: string,
    result: BaseEvent[]
  ): void {
    for (const [eventType, events] of eventsByType.entries()) {
      if (eventType.includes(type)) {
        result.push(...events);
      }
    }
  }
  
  /**
   * Get the document region affected by an event
   * @param event Event to analyze
   * @returns Region affected by the event
   * @private
   */
  private getAffectedRegion(event: BaseEvent): { start: number; end: number } {
    const eventType = event.type;
    
    if (eventType.includes('INSERT_TEXT')) {
      const position = (event as any).position;
      const text = (event as any).text || '';
      return { start: position, end: position + text.length };
    } else if (eventType.includes('DELETE_TEXT')) {
      const position = (event as any).position;
      const length = (event as any).length || 0;
      return { start: position, end: position + length };
    } else if (eventType.includes('FORMAT_TEXT')) {
      const position = (event as any).position;
      const length = (event as any).length || 0;
      return { start: position, end: position + length };
    }
    
    // Default to empty region if type is unknown
    return { start: 0, end: 0 };
  }
  
  /**
   * Check if two regions overlap
   * @param a First region
   * @param b Second region
   * @returns Whether the regions overlap
   * @private
   */
  private regionsOverlap(
    a: { start: number; end: number },
    b: { start: number; end: number }
  ): boolean {
    // Empty regions can't overlap
    if (a.start === a.end || b.start === b.end) {
      return false;
    }
    
    // Check for overlap
    return a.start < b.end && b.start < a.end;
  }
  
  /**
   * Calculate percentage of overlap between two regions
   * @param a First region
   * @param b Second region
   * @returns Percentage of overlap (0-100)
   * @private
   */
  private calculateOverlapPercent(
    a: { start: number; end: number },
    b: { start: number; end: number }
  ): number {
    // Calculate overlap
    const overlapStart = Math.max(a.start, b.start);
    const overlapEnd = Math.min(a.end, b.end);
    
    if (overlapStart >= overlapEnd) {
      return 0; // No overlap
    }
    
    const overlapLength = overlapEnd - overlapStart;
    const aLength = a.end - a.start;
    const bLength = b.end - b.start;
    
    // Overlap percentage is based on the smaller of the two regions
    const smallerLength = Math.min(aLength, bLength);
    
    return (overlapLength / smallerLength) * 100;
  }
  
  /**
   * Get the conflict type for two events
   * @param local Local event
   * @param remote Remote event
   * @returns Type of conflict
   * @private
   */
  private getConflictType(local: BaseEvent, remote: BaseEvent): ConflictType {
    const localType = local.type;
    const remoteType = remote.type;
    
    if (localType.includes('INSERT_TEXT') && remoteType.includes('INSERT_TEXT')) {
      return ConflictType.TEXT_EDIT;
    } else if (localType.includes('FORMAT_TEXT') && remoteType.includes('FORMAT_TEXT')) {
      return ConflictType.FORMAT;
    } else if (
      (localType.includes('DELETE_TEXT') && remoteType.includes('INSERT_TEXT')) ||
      (localType.includes('INSERT_TEXT') && remoteType.includes('DELETE_TEXT'))
    ) {
      return ConflictType.DELETE_MODIFIED;
    } else if (
      (localType.includes('DELETE_TEXT') && remoteType.includes('FORMAT_TEXT')) ||
      (localType.includes('FORMAT_TEXT') && remoteType.includes('DELETE_TEXT'))
    ) {
      return ConflictType.DELETE_MODIFIED;
    } else {
      // Default to structural conflict for unknown combinations
      return ConflictType.STRUCTURAL;
    }
  }
  
  /**
   * Get the event with the broader text range
   * @param a First event
   * @param b Second event
   * @returns Event with broader range
   * @private
   */
  private getEventWithBroaderRange(a: BaseEvent, b: BaseEvent): BaseEvent {
    const aRegion = this.getAffectedRegion(a);
    const bRegion = this.getAffectedRegion(b);
    
    const aLength = aRegion.end - aRegion.start;
    const bLength = bRegion.end - bRegion.start;
    
    return aLength >= bLength ? a : b;
  }
  
  /**
   * Log conflict details to compliance log
   * @param conflict Conflict to log
   * @param stage Stage of conflict handling (detected/resolved)
   * @private
   */
  private async logConflictToCompliance(
    conflict: Conflict,
    stage: 'detected' | 'resolved'
  ): Promise<void> {
    await ComplianceLogger.log({
      eventType: `conflict.${stage}`,
      resourceId: conflict.local.aggregateId,
      description: `Document edit conflict ${stage}: ${conflict.type}`,
      metadata: {
        conflictType: conflict.type,
        localEventId: conflict.local.id,
        localEventType: conflict.local.type,
        localUserId: conflict.local.userId,
        remoteEventId: conflict.remote.id,
        remoteEventType: conflict.remote.type,
        remoteUserId: conflict.remote.userId,
        localRegion: conflict.localRegion,
        remoteRegion: conflict.remoteRegion
      }
    });
  }
  
  /**
   * Apply conflict resolution to a document
   * @param documentId Document to update
   * @param resolution Resolution to apply
   * @returns Whether the resolution was applied successfully
   */
  async applyResolution(
    documentId: string,
    resolution: ConflictResolution
  ): Promise<boolean> {
    try {
      // Only apply if there's a resolved event
      if (!resolution.resolvedEvent) {
        return false;
      }
      
      // Apply the resolved event
      await this.eventStore.appendEvent(resolution.resolvedEvent);
      
               console.error('Failed to apply conflict resolution:', error);
          
          // Record metrics for resolution failure
          await this.metricsCollector.incrementCounter('conflict.resolution.failed', {
            documentId,
            result: resolution.result,
            error: (error as Error).message
          });
          
          return false;
        }
      }
      
      /**
       * Resolve all conflicts for a document in batch
       * @param documentId Document to check
       * @param localEvent New local event to check for conflicts
       * @param strategy Resolution strategy to apply
       * @returns Array of conflict resolutions
       */
      async resolveConflictsForDocument(
        documentId: string,
        localEvent: BaseEvent,
        strategy: ConflictResolutionStrategy = this.config.defaultStrategy
      ): Promise<ConflictResolution[]> {
        // Get all recent events for this document
        const recentEvents = await this.eventStore.getEvents<BaseEvent>(
          documentId,
          localEvent.aggregateVersion - 10 // Look at recent events only
        );
        
        // Filter out events from the same user
        const remoteEvents = recentEvents.filter(
          event => event.userId !== localEvent.userId
        );
        
        // Detect conflicts
        const conflicts = await this.detectConflicts(localEvent, remoteEvents);
        
        if (conflicts.length === 0) {
          return [];
        }
        
        // Resolve each conflict
        const resolutions: ConflictResolution[] = [];
        for (const conflict of conflicts) {
          const resolution = await this.resolveConflict(conflict, strategy);
          resolutions.push(resolution);
          
          // Log resolved conflicts to compliance
          if (this.config.logConflictsToCompliance) {
            await this.logConflictToCompliance(conflict, 'resolved');
          }
        }
        
        return resolutions;
      }
      
      /**
       * Get the appropriate resolution strategy for a conflict
       * @param conflict Conflict to analyze
       * @returns Recommended resolution strategy
       */
      getRecommendedStrategy(conflict: Conflict): ConflictResolutionStrategy {
        // Use different strategies based on conflict type and complexity
        switch (conflict.type) {
          case ConflictType.TEXT_EDIT:
            // For text edits, try to merge when possible
            return ConflictResolutionStrategy.MERGE;
            
          case ConflictType.FORMAT:
            // Format changes can usually be merged
            return ConflictResolutionStrategy.MERGE;
            
          case ConflictType.DELETE_MODIFIED:
            // For deletion conflicts, prefer the modification over deletion
            return ConflictResolutionStrategy.REMOTE_FIRST;
            
          case ConflictType.STRUCTURAL:
            // Structural conflicts are complex, often require manual resolution
            return ConflictResolutionStrategy.MANUAL;
            
          case ConflictType.MOVE_MODIFIED:
            // Move conflicts are also complex
            return ConflictResolutionStrategy.MANUAL;
            
          default:
            // Default to the configured default strategy
            return this.config.defaultStrategy;
        }
      }
      
      /**
       * Check if an operation would conflict with current document state
       * @param documentId Document to check
       * @param operation Operation to validate
       * @returns Whether the operation conflicts with current state
       */
      async willOperationConflict(
        documentId: string,
        operation: DocumentCommand
      ): Promise<boolean> {
        // First, determine what region this operation would affect
        const region = this.getCommandAffectedRegion(operation);
        
        // Get recent events
        const recentEvents = await this.eventStore.getEvents<BaseEvent>(
          documentId
        );
        
        // Check for potential conflicts with recent events
        for (const event of recentEvents) {
          const eventRegion = this.getAffectedRegion(event);
          
          // If regions overlap, there's potential for conflict
          if (this.regionsOverlap(region, eventRegion)) {
            return true;
          }
        }
        
        return false;
      }
      
      /**
       * Get the document region that would be affected by a command
       * @param command Command to analyze
       * @returns Region that would be affected
       * @private
       */
      private getCommandAffectedRegion(command: DocumentCommand): { start: number; end: number } {
        if ('position' in command && 'text' in command) {
          // Insert text command
          const typedCommand = command as InsertTextCommand;
          return {
            start: typedCommand.position,
            end: typedCommand.position + typedCommand.text.length
          };
        } else if ('position' in command && 'length' in command) {
          // Delete text or format text command
          const typedCommand = command as DeleteTextCommand | FormatTextCommand;
          return {
            start: typedCommand.position,
            end: typedCommand.position + typedCommand.length
          };
        }
        
        // Default for unknown command types
        return { start: 0, end: 0 };
      }
      
      /**
       * Generate statistics about conflicts for a document
       * @param documentId Document to analyze
       * @returns Conflict statistics
       */
      async getConflictStatistics(documentId: string): Promise<{
        totalConflicts: number;
        resolvedConflicts: number;
        unresolvedConflicts: number;
        conflictsByType: Record<ConflictType, number>;
        averageResolutionTimeMs: number;
      }> {
        const tenantContext = getTenantContext();
        
        if (!tenantContext?.tenantId) {
          throw new Error('Cannot get conflict statistics: No tenant context available');
        }
        
        // Get metrics from metrics collector
        const totalConflicts = await this.metricsCollector.getCounter('conflicts.detected', {
          documentId
        });
        
        const resolvedConflicts = await this.metricsCollector.getCounter('conflict.resolution.applied', {
          documentId
        });
        
        const averageResolutionTimeMs = await this.metricsCollector.getAverageValue('conflict.resolution.timeMs', {
          documentId
        });
        
        // Calculate unresolved conflicts
        const unresolvedConflicts = Math.max(0, totalConflicts - resolvedConflicts);
        
        // Get conflicts by type (simplified implementation)
        const conflictsByType = {
          [ConflictType.TEXT_EDIT]: 0,
          [ConflictType.FORMAT]: 0,
          [ConflictType.DELETE_MODIFIED]: 0,
          [ConflictType.STRUCTURAL]: 0,
          [ConflictType.MOVE_MODIFIED]: 0
        };
        
        // In a real implementation, you would query the metrics for each type
        // For simplicity, we'll return the statistics we have
        
        return {
          totalConflicts,
          resolvedConflicts,
          unresolvedConflicts,
          conflictsByType,
          averageResolutionTimeMs
        };
      }
      
      /**
       * Update the HLC with an external timestamp
       * @param externalTimestamp External timestamp to incorporate
       * @returns Updated local timestamp
       */
      updateClock(externalTimestamp: string): string {
        return this.clock.update(externalTimestamp);
      }
      
      /**
       * Get current HLC timestamp
       * @returns Current timestamp
       */
      getCurrentTimestamp(): string {
        return this.clock.getTimestamp();
      }
    }