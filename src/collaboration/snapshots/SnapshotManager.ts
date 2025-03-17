import { MetricsCollector } from '../../metrics/collector';
import { EventStore } from '../events/EventStore';
import { SnapshotStore } from './SnapshotStore';
import { DocumentId } from '../types';

export interface SnapshotConfig {
  minEventCount: number;
  maxEventCount: number;
  minTimeSinceLastSnapshot: number;
  targetReconstructionTime: number;
}

/**
 * Manages document snapshots with adaptive creation frequency
 * based on document size, edit velocity, and access patterns
 */
export class SnapshotManager {
  private readonly config: SnapshotConfig;
  
  constructor(
    private snapshotStore: SnapshotStore,
    private eventStore: EventStore,
    private metricsCollector: MetricsCollector,
    config?: Partial<SnapshotConfig>
  ) {
    // Default configuration values
    this.config = {
      minEventCount: 50,
      maxEventCount: 1000,
      minTimeSinceLastSnapshot: 60000, // 1 minute
      targetReconstructionTime: 100,   // 100ms
      ...config
    };
  }
  
  /**
   * Determines if a snapshot should be created for the given document
   */
  async shouldCreateSnapshot(documentId: DocumentId, tenantId: string): Promise<boolean> {
    // Get the latest snapshot
    const latestSnapshot = await this.snapshotStore.getLatestSnapshot(documentId, tenantId);
    const lastVersion = latestSnapshot?.version || 0;
    
    // Count events since last snapshot
    const eventCount = await this.eventStore.getEventCountSinceVersion(
      documentId, 
      lastVersion,
      tenantId
    );
    
    // If below minimum threshold, don't create snapshot
    if (eventCount < this.config.minEventCount) {
      return false;
    }
    
    // If above maximum threshold, force snapshot
    if (eventCount > this.config.maxEventCount) {
      return true;
    }
    
    // Check time since last snapshot
    if (latestSnapshot) {
      const lastSnapshotTime = new Date(latestSnapshot.timestamp).getTime();
      const timeSinceLastSnapshot = Date.now() - lastSnapshotTime;
      
      if (timeSinceLastSnapshot < this.config.minTimeSinceLastSnapshot) {
        return false;
      }
    }
    
    // Check recent document reconstruction time
    const recentReconstructionTime = await this.metricsCollector.getAverageValue(
      `document.reconstruction.time.${documentId}`,
      { timeWindow: '1h' }
    );
    
    // If reconstruction is becoming slow, create snapshot more aggressively
    if (recentReconstructionTime && recentReconstructionTime > this.config.targetReconstructionTime) {
      return true;
    }
    
    // Check document access frequency
    const accessCount = await this.metricsCollector.getCountValue(
      `document.access.count.${documentId}`,
      { timeWindow: '24h' }
    );
    
    // Create more snapshots for frequently accessed documents
    return accessCount > 10;
  }
  
  /**
   * Creates a snapshot for the document
   */
  async createSnapshot(
    documentId: DocumentId,
    tenantId: string, 
    document: any,
    version: number
  ): Promise<any> {
    const startTime = performance.now();
    
    try {
      // Create snapshot metadata
      const metadata = {
        version,
        documentId,
        timestamp: new Date().toISOString(),
        eventCount: await this.eventStore.getEventCountSinceVersion(documentId, 0, tenantId)
      };
      
      // Store the snapshot
      const snapshot = await this.snapshotStore.createSnapshot(
        documentId,
        tenantId,
        document,
        metadata
      );
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('snapshot.creation.time', duration);
      await this.metricsCollector.increment('snapshot.created', 1);
      
      return snapshot;
    } catch (error) {
      // Record failure
      await this.metricsCollector.increment('snapshot.creation.failed', 1);
      throw error;
    }
  }
  
  /**
   * Gets the latest snapshot for the document
   */
  async getLatestSnapshot(documentId: DocumentId, tenantId: string): Promise<any> {
    return this.snapshotStore.getLatestSnapshot(documentId, tenantId);
  }
}