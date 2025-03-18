import { MetricsCollector } from '../../metrics/collector';
import { EventStore } from '../events/EventStore';
import { SnapshotStore, Snapshot, SnapshotMetadata } from './SnapshotStore';
import { DocumentId } from '../types';
import { ComplianceLogger } from '../../compliance/logger';
import { getTenantContext } from '../../lib/tenant-context';

export interface SnapshotConfig {
  minEventCount: number;
  maxEventCount: number;
  minTimeSinceLastSnapshot: number;
  targetReconstructionTime: number;
  compressionTarget: number;
  keepVersions: number;
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
      compressionTarget: 0.7,          // 70% compression
      keepVersions: 5,                 // Keep latest 5 snapshots
      ...config
    };
  }
  
  /**
   * Determines if a snapshot should be created for the given document
   * using adaptive thresholds based on document activity and size
   */
  async shouldCreateSnapshot(documentId: DocumentId, tenantId: string): Promise<boolean> {
    // Get the latest snapshot and count of events since
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
      await this.metricsCollector.track('snapshot.decision', 1, {
        documentId,
        reason: 'event_count',
        count: eventCount,
        threshold: this.config.maxEventCount
      });
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
      await this.metricsCollector.track('snapshot.decision', 1, {
        documentId,
        reason: 'slow_reconstruction',
        reconstructionTime: recentReconstructionTime,
        threshold: this.config.targetReconstructionTime
      });
      return true;
    }
    
    // Check document access frequency
    const accessCount = await this.metricsCollector.getCountValue(
      `document.access.count.${documentId}`,
      { timeWindow: '24h' }
    );
    
    // Create more snapshots for frequently accessed documents
    if (accessCount && accessCount > 10) {
      await this.metricsCollector.track('snapshot.decision', 1, {
        documentId,
        reason: 'high_access',
        accessCount,
        threshold: 10
      });
      return true;
    }
    
    return false;
  }
  
  /**
   * Creates a snapshot for the document
   */
  async createSnapshot(
    documentId: DocumentId,
    tenantId: string, 
    document: any,
    version: number
  ): Promise<Snapshot> {
    const startTime = performance.now();
    
    try {
      // Get current tenant context for logging
      const tenantContext = getTenantContext();
      const userId = tenantContext?.userId || 'system';
      
      // Create snapshot metadata
      const metadata: SnapshotMetadata = {
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
      
      // Calculate compression ratio if applicable
      if (typeof document === 'object' && document !== null) {
        const snapshotSize = JSON.stringify(snapshot.data).length;
        const fullStateSize = JSON.stringify(document).length;
        const compressionRatio = snapshotSize / fullStateSize;
        
        await this.metricsCollector.recordValue('snapshot.compression.ratio', compressionRatio);
      }
      
      // Log snapshot creation for compliance
      await ComplianceLogger.log({
        eventType: 'document.snapshot.created',
        resourceId: documentId,
        description: `Created snapshot for document at version ${version}`,
        metadata: {
          tenantId,
          version,
          creationTimeMs: duration,
          createdBy: userId
        }
      });
      
      // Prune old snapshots in the background
      this.pruneOldSnapshots(documentId, tenantId).catch(error => {
        console.error(`Failed to prune old snapshots: ${error}`);
      });
      
      return snapshot;
    } catch (error) {
      // Record failure
      await this.metricsCollector.increment('snapshot.creation.failed', 1);
      
      // Log failure
      await ComplianceLogger.log({
        eventType: 'document.snapshot.failed',
        resourceId: documentId,
        description: `Failed to create snapshot for document`,
        metadata: {
          tenantId,
          version,
          error: (error as Error).message
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Gets the latest snapshot for the document
   */
  async getLatestSnapshot(documentId: DocumentId, tenantId: string): Promise<Snapshot | null> {
    try {
      const snapshot = await this.snapshotStore.getLatestSnapshot(documentId, tenantId);
      
      if (snapshot) {
        // Record access metric
        await this.metricsCollector.increment(`document.access.count.${documentId}`, 1);
      }
      
      return snapshot;
    } catch (error) {
      await this.metricsCollector.increment('snapshot.get.failed', 1);
      throw error;
    }
  }
  
  /**
   * Gets a snapshot by specific version
   */
  async getSnapshotByVersion(documentId: DocumentId, tenantId: string, version: number): Promise<Snapshot | null> {
    try {
      return await this.snapshotStore.getSnapshotByVersion(documentId, tenantId, version);
    } catch (error) {
      await this.metricsCollector.increment('snapshot.getByVersion.failed', 1);
      throw error;
    }
  }
  
  /**
   * Checks if a snapshot exists for the given version
   */
  async hasSnapshotForVersion(documentId: DocumentId, tenantId: string, version: number): Promise<boolean> {
    try {
      const snapshot = await this.snapshotStore.getSnapshotByVersion(documentId, tenantId, version);
      return snapshot !== null;
    } catch (error) {
      return false;
    }
  }
  
  /**
   * Prunes old snapshots, keeping only the latest N versions
   */
  private async pruneOldSnapshots(documentId: DocumentId, tenantId: string): Promise<void> {
    try {
      const count = await this.snapshotStore.pruneOldSnapshots(
        documentId, 
        tenantId,
        this.config.keepVersions
      );
      
      if (count > 0) {
        await ComplianceLogger.log({
          eventType: 'document.snapshot.pruned',
          resourceId: documentId,
          description: `Pruned ${count} old snapshots for document`,
          metadata: {
            tenantId,
            count,
            keepVersions: this.config.keepVersions
          }
        });
      }
    } catch (error) {
      console.error(`Failed to prune old snapshots: ${error}`);
      await this.metricsCollector.increment('snapshot.prune.error', 1);
    }
  }
}