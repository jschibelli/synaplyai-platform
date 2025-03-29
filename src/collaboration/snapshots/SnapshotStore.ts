import { PrismaClient } from '@prisma/client';
import { DocumentId } from '../types';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenant-context';
import { v4 as uuidv4 } from 'uuid';

export interface SnapshotMetadata {
  version: number;
  documentId: string;
  timestamp: number;
  eventCount: number;
}

/**
 * Represents a point-in-time snapshot of a document's state
 */
export interface Snapshot {
  id: string;
  documentId: string;
  tenantId: string;
  version: number;
  data: any; // The actual document state
  metadata: SnapshotMetadata;
  timestamp: number;
  lastEventId?: string;
}

/**
 * Store for document snapshots with tenant isolation
 */
export class SnapshotStore {
  // Default thresholds for snapshot creation
  private static DEFAULT_EVENT_COUNT_THRESHOLD = 100;
  private static DEFAULT_TIME_THRESHOLD_MS = 1000 * 60 * 60; // 1 hour
  private static CACHE_TTL_MS = 1000 * 60 * 5; // 5 minutes
  
  // In-memory cache for snapshots
  private snapshotCache = new Map<string, { snapshot: Snapshot; expiry: number }>();
  
  constructor(
    private prisma: PrismaClient,
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Creates a new snapshot for a document
   */
  async createSnapshot(
    documentId: DocumentId,
    tenantId: string,
    data: any,
    metadata: SnapshotMetadata
  ): Promise<Snapshot> {
    const startTime = performance.now();
    
    try {
      // Get current tenant context
      const tenantContext = getTenantContext();
      
      // Create snapshot in database
      const snapshot = await this.prisma.snapshot.create({
        data: {
          id: uuidv4(),
          documentId,
          tenantId,
          version: metadata.version,
          data: JSON.stringify(data), // Serialize document data
          metadata: JSON.stringify(metadata),
          timestamp: new Date(metadata.timestamp).toISOString(),
          createdBy: tenantContext?.userId || 'system'
        }
      });
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('snapshot.store.create', duration);
      await this.metricsCollector.recordValue('snapshot.size', JSON.stringify(data).length);
      
      // Create snapshot object
      const result: Snapshot = {
        id: snapshot.id,
        documentId: snapshot.documentId,
        tenantId: snapshot.tenantId,
        version: snapshot.version,
        data, // Return original data object (not serialized)
        metadata,
        timestamp: snapshot.timestamp,
        createdBy: snapshot.createdBy
      };
      
      // Update cache
      this.updateCache(result);
      
      return result;
    } catch (error) {
      await this.metricsCollector.increment('snapshot.store.create.failed', 1);
      throw error;
    }
  }
  
  /**
   * Gets the latest snapshot for a document
   */
  async getLatestSnapshot(documentId: DocumentId, tenantId: string): Promise<Snapshot | null> {
    const startTime = performance.now();
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(documentId, tenantId, 'latest');
      const cached = this.snapshotCache.get(cacheKey);
      
      if (cached && cached.expiry > Date.now()) {
        await this.metricsCollector.increment('snapshot.cache.hit', 1);
        return cached.snapshot;
      }
      
      // Find latest snapshot by version
      const snapshot = await this.prisma.snapshot.findFirst({
        where: {
          documentId,
          tenantId
        },
        orderBy: {
          version: 'desc'
        }
      });
      
      if (!snapshot) {
        return null;
      }
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('snapshot.store.get', duration);
      await this.metricsCollector.increment('snapshot.cache.miss', 1);
      
      // Create snapshot object
      const result: Snapshot = {
        id: snapshot.id,
        documentId: snapshot.documentId,
        tenantId: snapshot.tenantId,
        version: snapshot.version,
        data: JSON.parse(snapshot.data as string),
        metadata: JSON.parse(snapshot.metadata as string),
        timestamp: snapshot.timestamp,
        createdBy: snapshot.createdBy
      };
      
      // Update cache
      this.updateCache(result, 'latest');
      
      return result;
    } catch (error) {
      await this.metricsCollector.increment('snapshot.store.get.failed', 1);
      throw error;
    }
  }
  
  /**
   * Gets a snapshot by version
   */
  async getSnapshotByVersion(
    documentId: DocumentId,
    tenantId: string,
    version: number
  ): Promise<Snapshot | null> {
    const startTime = performance.now();
    
    try {
      // Check cache first
      const cacheKey = this.getCacheKey(documentId, tenantId, version.toString());
      const cached = this.snapshotCache.get(cacheKey);
      
      if (cached && cached.expiry > Date.now()) {
        await this.metricsCollector.increment('snapshot.cache.hit', 1);
        return cached.snapshot;
      }
      
      // Find specific snapshot by version
      const snapshot = await this.prisma.snapshot.findFirst({
        where: {
          documentId,
          tenantId,
          version
        }
      });
      
      if (!snapshot) {
        return null;
      }
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('snapshot.store.getByVersion', duration);
      await this.metricsCollector.increment('snapshot.cache.miss', 1);
      
      // Create snapshot object
      const result: Snapshot = {
        id: snapshot.id,
        documentId: snapshot.documentId,
        tenantId: snapshot.tenantId,
        version: snapshot.version,
        data: JSON.parse(snapshot.data as string),
        metadata: JSON.parse(snapshot.metadata as string),
        timestamp: snapshot.timestamp,
        createdBy: snapshot.createdBy
      };
      
      // Update cache
      this.updateCache(result);
      
      return result;
    } catch (error) {
      await this.metricsCollector.increment('snapshot.store.getByVersion.failed', 1);
      throw error;
    }
  }
  
  /**
   * Determines whether a new snapshot should be created based on various criteria
   * 
   * @param documentId Document identifier
   * @returns True if snapshot should be created
   */
  async shouldCreateSnapshot(documentId: string): Promise<boolean> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      return false;
    }
    
    try {
      // Get latest snapshot
      const latestSnapshot = await this.getLatestSnapshot(documentId, tenantContext.tenantId);
      
      // Get event count since last snapshot
      const lastSnapshotVersion = latestSnapshot?.version || 0;
      
      // Count events since last snapshot
      const eventCount = await this.prisma.event.count({
        where: {
          documentId,
          tenantId: tenantContext.tenantId,
          version: {
            gt: lastSnapshotVersion
          }
        }
      });
      
      // Check if event count exceeds threshold
      if (eventCount > SnapshotStore.DEFAULT_EVENT_COUNT_THRESHOLD) {
        await this.metricsCollector.track('snapshot.decision', 1, {
          documentId,
          reason: 'event_count',
          count: eventCount,
          threshold: SnapshotStore.DEFAULT_EVENT_COUNT_THRESHOLD
        });
        return true;
      }
      
      // Check if time since last snapshot exceeds threshold
      if (latestSnapshot) {
        const timeSinceSnapshot = Date.now() - new Date(latestSnapshot.timestamp).getTime();
        if (timeSinceSnapshot > SnapshotStore.DEFAULT_TIME_THRESHOLD_MS) {
          await this.metricsCollector.track('snapshot.decision', 1, {
            documentId,
            reason: 'time_threshold',
            timeSinceMs: timeSinceSnapshot,
            thresholdMs: SnapshotStore.DEFAULT_TIME_THRESHOLD_MS
          });
          return true;
        }
      } else {
        // No snapshot exists, create one
        await this.metricsCollector.track('snapshot.decision', 1, {
          documentId,
          reason: 'first_snapshot'
        });
        return true;
      }
      
      // Default: no need to create snapshot
      return false;
    } catch (error) {
      console.error('Error determining if snapshot should be created:', error);
      return false;
    }
  }
  
  /**
   * Purges old snapshots keeping only the latest N
   * 
   * @param documentId Document identifier
   * @param keepCount Number of snapshots to keep
   * @returns Number of purged snapshots
   */
  async purgeOldSnapshots(documentId: string, keepCount: number = 5): Promise<number> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot purge snapshots: No tenant context available');
    }
    
    try {
      // Find all snapshots for document
      const snapshots = await this.prisma.snapshot.findMany({
        where: {
          documentId,
          tenantId: tenantContext.tenantId
        },
        orderBy: {
          version: 'desc'
        }
      });
      
      // If fewer snapshots than keepCount, do nothing
      if (snapshots.length <= keepCount) {
        return 0;
      }
      
      // Identify snapshots to delete (all except the newest keepCount)
      const snapshotsToDelete = snapshots.slice(keepCount);
      const idsToDelete = snapshotsToDelete.map(s => s.id);
      
      // Delete the snapshots
      const result = await this.prisma.snapshot.deleteMany({
        where: {
          id: {
            in: idsToDelete
          }
        }
      });
      
      // Record metrics
      await this.metricsCollector.track('snapshot.purged', result.count, {
        documentId,
        tenantId: tenantContext.tenantId,
        keepCount
      });
      
      return result.count;
    } catch (error) {
      await this.metricsCollector.increment('snapshot.purge.error', 1);
      throw error;
    }
  }
  
  /**
   * Clears the snapshot cache for a document
   * 
   * @param documentId Document identifier
   */
  clearCache(documentId: string): void {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return;
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    this.snapshotCache.delete(key);
  }
  
  /**
   * Cache a snapshot
   * @private
   */
  private cacheSnapshot(snapshot: Snapshot): void {
    const key = `${snapshot.tenantId}:${snapshot.documentId}`;
    const expires = Date.now() + SnapshotStore.CACHE_TTL_MS;
    this.snapshotCache.set(key, { snapshot, expires });
    this.cleanupExpiredCache();
  }
  
  /**
   * Get cached snapshot if valid
   * @private
   */
  private getCachedSnapshot(documentId: string): Snapshot | null {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return null;
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    const cached = this.snapshotCache.get(key);
    
    if (!cached) return null;
    
    // Check if cache entry is expired
    if (cached.expires < Date.now()) {
      this.snapshotCache.delete(key);
      return null;
    }
    
    return cached.snapshot;
  }
  
  /**
   * Remove expired entries from the cache
   * @private
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    for (const [key, { expires }] of this.snapshotCache.entries()) {
      if (expires < now) {
        this.snapshotCache.delete(key);
      }
    }
  }
  
  /**
   * Delete snapshots older than the specified version, keeping N versions
   */
  async pruneOldSnapshots(
    documentId: DocumentId,
    tenantId: string,
    keepLatestVersions: number = 5
  ): Promise<number> {
    try {
      // Find the latest N snapshots to keep
      const latestSnapshots = await this.prisma.snapshot.findMany({
        where: { documentId, tenantId },
        orderBy: { version: 'desc' },
        take: keepLatestVersions,
        select: { version: true }
      });
      
      if (latestSnapshots.length === 0) {
        return 0;
      }
      
      // Get the lowest version to keep
      const minVersionToKeep = latestSnapshots[latestSnapshots.length - 1].version;
      
      // Delete older snapshots
      const result = await this.prisma.snapshot.deleteMany({
        where: {
          documentId,
          tenantId,
          version: {
            lt: minVersionToKeep
          }
        }
      });
      
      // Clear cache entries for deleted snapshots
      this.clearCacheByPredicate(entry => 
        entry.snapshot.documentId === documentId && 
        entry.snapshot.tenantId === tenantId && 
        entry.snapshot.version < minVersionToKeep
      );
      
      await this.metricsCollector.increment('snapshot.pruned', result.count);
      return result.count;
    } catch (error) {
      await this.metricsCollector.increment('snapshot.prune.failed', 1);
      throw error;
    }
  }
  
  /**
   * Updates a snapshot in the cache
   */
  private updateCache(snapshot: Snapshot, versionKey?: string): void {
    const expiry = Date.now() + SnapshotStore.CACHE_TTL_MS;
    
    // Cache by exact version
    const versionCacheKey = this.getCacheKey(
      snapshot.documentId, 
      snapshot.tenantId, 
      versionKey || snapshot.version.toString()
    );
    
    this.snapshotCache.set(versionCacheKey, {
      snapshot,
      expiry
    });
    
    // If this is the latest version, also cache as 'latest'
    if (versionKey !== 'latest') {
      this.getLatestSnapshot(snapshot.documentId, snapshot.tenantId)
        .then(latestSnapshot => {
          if (latestSnapshot && snapshot.version >= latestSnapshot.version) {
            const latestCacheKey = this.getCacheKey(
              snapshot.documentId, 
              snapshot.tenantId, 
              'latest'
            );
            
            this.snapshotCache.set(latestCacheKey, {
              snapshot,
              expiry
            });
          }
        })
        .catch(() => {
          // Ignore caching errors - will just result in a cache miss later
        });
    }
  }
  
  /**
   * Generate a cache key for a snapshot
   */
  private getCacheKey(documentId: string, tenantId: string, versionKey: string): string {
    return `${tenantId}:${documentId}:${versionKey}`;
  }
  
  /**
   * Clear cache entries based on a predicate function
   */
  private clearCacheByPredicate(
    predicate: (entry: { snapshot: Snapshot; expiry: number }) => boolean
  ): void {
    for (const [key, entry] of this.snapshotCache.entries()) {
      if (predicate(entry)) {
        this.snapshotCache.delete(key);
      }
    }
  }
  
  /**
   * Periodically cleanup expired cache entries
   */
  startCacheCleanup(intervalMs: number = 60000): NodeJS.Timeout {
    return setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.snapshotCache.entries()) {
        if (entry.expiry < now) {
          this.snapshotCache.delete(key);
        }
      }
    }, intervalMs);
  }
}