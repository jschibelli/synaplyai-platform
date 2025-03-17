import { Operation } from './OperationalTransform';
import { VectorClock } from './VectorClock';
import { ComplianceLogger } from '../../compliance/logger';
import { MetricsCollector } from '../../metrics/collector';

/**
 * Represents an operation with its associated vector clock for conflict detection
 */
export interface VersionedOperation {
  operation: Operation;
  vectorClock: VectorClock;
  clientId: string;
  timestamp: number;
  documentId?: string;
}

/**
 * Types of conflicts that can occur in collaborative editing
 */
export type ConflictType = 'TEXT_EDIT' | 'FORMAT' | 'DELETE_MODIFIED' | 'STRUCTURAL' | 'MOVE_MODIFIED';

/**
 * Represents the relationship between two operations
 */
export type OperationRelationship = 'before' | 'after' | 'concurrent' | 'same';

/**
 * Result of conflict detection
 */
export interface ConflictDetectionResult {
  hasConflict: boolean;
  relationship: OperationRelationship;
  conflictType?: ConflictType;
  confidenceScore?: number;
  region1?: { start: number; end: number };
  region2?: { start: number; end: number };
  overlapPercentage?: number;
}

/**
 * Configuration for conflict detection
 */
export interface ConflictDetectorConfig {
  /**
   * Minimum overlap percentage to consider regions conflicting
   */
  minOverlapPercentage: number;
  
  /**
   * Whether to log conflicts to compliance logs
   */
  logToCompliance: boolean;
}

/**
 * Detects conflicts between concurrent operations in collaborative editing.
 */
export class ConflictDetector {
  private config: ConflictDetectorConfig;
  
  /**
   * Creates a new ConflictDetector
   * 
   * @param metricsCollector Metrics collector for tracking performance
   * @param config Optional configuration
   */
  constructor(
    private metricsCollector: MetricsCollector,
    config?: Partial<ConflictDetectorConfig>
  ) {
    this.config = {
      minOverlapPercentage: 1, // 1% overlap is considered a conflict by default
      logToCompliance: true,
      ...config
    };
  }
  
  /**
   * Detect if two operations conflict with each other
   * 
   * @param op1 First operation
   * @param op2 Second operation
   * @returns Result of conflict detection
   */
  async detectConflict(
    op1: VersionedOperation,
    op2: VersionedOperation
  ): Promise<ConflictDetectionResult> {
    const startTime = performance.now();
    
    try {
      // Determine the relationship between operations using vector clocks
      const relationship = this.determineRelationship(op1, op2);
      
      // If operations are causally related (one happened before the other),
      // there's no conflict by definition
      if (relationship === 'before' || relationship === 'after') {
        return {
          hasConflict: false,
          relationship
        };
      }
      
      // If operations are from the same client, we assume they're intended to be sequential
      if (op1.clientId === op2.clientId) {
        // For same client, use vector clocks to determine ordering
        if (op1.vectorClock.getClock(op1.clientId) < op2.vectorClock.getClock(op1.clientId)) {
          return {
            hasConflict: false,
            relationship: 'before'
          };
        } else if (op1.vectorClock.getClock(op1.clientId) > op2.vectorClock.getClock(op1.clientId)) {
          return {
            hasConflict: false,
            relationship: 'after'
          };
        }
        
        // If vector clocks are equal for the same client, it's a duplicate
        return {
          hasConflict: false,
          relationship: 'same'
        };
      }
      
      // Get operation regions (the parts of the document they affect)
      const region1 = this.getOperationRegion(op1.operation);
      const region2 = this.getOperationRegion(op2.operation);
      
      // Calculate overlap percentage
      const overlapPercentage = this.calculateOverlapPercentage(region1, region2);
      
      // If regions don't overlap at all or overlap is below threshold, no conflict
      if (overlapPercentage < this.config.minOverlapPercentage) {
        return {
          hasConflict: false,
          relationship: 'concurrent',
          region1,
          region2,
          overlapPercentage
        };
      }
      
      // Determine conflict type based on operation types
      const conflictType = this.determineConflictType(op1, op2);
      
      // If no actual conflict (like format operations affecting different attributes),
      // return no conflict despite overlapping regions
      if (!conflictType) {
        return {
          hasConflict: false,
          relationship: 'concurrent',
          region1,
          region2,
          overlapPercentage
        };
      }
      
      // Calculate confidence score based on overlap and operation types
      const confidenceScore = this.calculateConfidenceScore(
        overlapPercentage,
        op1.operation,
        op2.operation
      );
      
      // Log conflict to compliance logger if enabled
      if (this.config.logToCompliance && conflictType) {
        await this.logConflictToCompliance(op1, op2, conflictType, overlapPercentage);
      }
      
      // Return conflict details
      return {
        hasConflict: true,
        relationship: 'concurrent',
        conflictType,
        confidenceScore,
        region1,
        region2,
        overlapPercentage
      };
    } finally {
      // Record metrics about conflict detection
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('conflict.detection', duration);
    }
  }
  
  /**
   * Determine the relationship between two operations using vector clocks
   * @private
   */
  private determineRelationship(
    op1: VersionedOperation,
    op2: VersionedOperation
  ): OperationRelationship {
    const clock1 = op1.vectorClock;
    const clock2 = op2.vectorClock;
    
    if (clock1.happenedBefore(clock2)) {
      return 'before';
    } else if (clock2.happenedBefore(clock1)) {
      return 'after';
    } else if (clock1.equals(clock2)) {
      return 'same';
    } else {
      return 'concurrent';
    }
  }
  
  /**
   * Determine the type of conflict between two operations
   * @private
   */
  private determineConflictType(
    op1: VersionedOperation,
    op2: VersionedOperation
  ): ConflictType | undefined {
    const type1 = op1.operation.type;
    const type2 = op2.operation.type;
    
    // Text edit conflict: concurrent inserts or deletes at overlapping positions
    if ((type1 === 'insert' || type1 === 'delete') && 
        (type2 === 'insert' || type2 === 'delete')) {
      return 'TEXT_EDIT';
    }
    
    // Format conflict: concurrent format changes to the same region
    if (type1 === 'format' && type2 === 'format') {
      // Check if the same attributes are being modified
      const attributes1 = (op1.operation as any).attributes || {};
      const attributes2 = (op2.operation as any).attributes || {};
      
      // Find attributes that are modified in both operations
      const commonAttributes = Object.keys(attributes1)
        .filter(key => key in attributes2);
      
      // Only consider it a conflict if changing the same attributes
      if (commonAttributes.length > 0) {
        return 'FORMAT';
      }
      
      // Different attributes being modified, not a conflict
      return undefined;
    }
    
    // Delete-modified conflict: one operation deletes content that another modifies
    if ((type1 === 'delete' && (type2 === 'insert' || type2 === 'format')) ||
        (type2 === 'delete' && (type1 === 'insert' || type1 === 'format'))) {
      return 'DELETE_MODIFIED';
    }
    
    // No recognized conflict pattern
    return undefined;
  }
  
  /**
   * Get the region affected by an operation
   * @private
   */
  private getOperationRegion(operation: Operation): { start: number; end: number } {
    switch (operation.type) {
      case 'insert': {
        const position = operation.position;
        const length = operation.content.length;
        return { start: position, end: position + length };
      }
      case 'delete': {
        const position = operation.position;
        const length = operation.length;
        return { start: position, end: position + length };
      }
      case 'format': {
        const position = (operation as any).position;
        const length = (operation as any).length;
        return { start: position, end: position + length };
      }
      default:
        return { start: 0, end: 0 };
    }
  }
  
  /**
   * Calculate the percentage of overlap between two regions
   * @private
   */
  private calculateOverlapPercentage(
    region1: { start: number; end: number },
    region2: { start: number; end: number }
  ): number {
    // No overlap
    if (region1.end <= region2.start || region2.end <= region1.start) {
      return 0;
    }
    
    // Calculate overlap
    const overlapStart = Math.max(region1.start, region2.start);
    const overlapEnd = Math.min(region1.end, region2.end);
    const overlapLength = overlapEnd - overlapStart;
    
    // Calculate sizes
    const size1 = region1.end - region1.start;
    const size2 = region2.end - region2.start;
    
    // Prevent division by zero
    if (size1 === 0 || size2 === 0) {
      return 0;
    }
    
    // Return percentage of overlap relative to the smaller region
    const smallerSize = Math.min(size1, size2);
    return (overlapLength / smallerSize) * 100;
  }
  
  /**
   * Calculate confidence score for a detected conflict
   * @private
   */
  private calculateConfidenceScore(
    overlapPercentage: number,
    op1: Operation,
    op2: Operation
  ): number {
    // Start with overlap percentage as base confidence
    let confidence = overlapPercentage / 100;
    
    // Adjust based on operation types
    if (op1.type === 'insert' && op2.type === 'insert') {
      // Inserting at exactly the same position is a strong conflict indicator
      if ((op1 as any).position === (op2 as any).position) {
        confidence = Math.max(confidence, 0.95);
      }
    } else if (op1.type === 'delete' && op2.type === 'delete') {
      // Deleting exactly the same content is a strong conflict indicator
      if ((op1 as any).position === (op2 as any).position && 
          (op1 as any).length === (op2 as any).length) {
        confidence = Math.max(confidence, 0.95);
      }
    } else if (op1.type === 'format' && op2.type === 'format') {
      // Format conflicts can be more subtle, adjust confidence based on attributes
      confidence = Math.min(confidence + 0.1, 0.9);
    }
    
    return confidence;
  }
  
  /**
   * Log conflict details to compliance log
   * @private
   */
  private async logConflictToCompliance(
    op1: VersionedOperation,
    op2: VersionedOperation,
    conflictType: ConflictType,
    overlapPercentage: number
  ): Promise<void> {
    await ComplianceLogger.log({
      eventType: 'conflict.detected',
      resourceId: op1.documentId || 'unknown',
      description: `Editing conflict detected: ${conflictType}`,
      metadata: {
        conflictType,
        client1: op1.clientId,
        client2: op2.clientId,
        operation1Type: op1.operation.type,
        operation2Type: op2.operation.type,
        overlapPercentage: overlapPercentage.toFixed(2),
        timestamp: new Date().toISOString()
      }
    });
  }
}