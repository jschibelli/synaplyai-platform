import { EventStore, Event } from './events/EventStore';
import { SnapshotStore, Snapshot } from './snapshots/SnapshotStore';
import { OperationalTransform } from './conflict/OperationalTransform';
import { MetricsCollector } from '../metrics/metrics-collector';
import { getTenantContext } from '../lib/tenant-context';

export interface DocumentState {
  documentId: string;
  content: string;
  formatting: Record<string, any>;
  metadata: Record<string, any>;
  version: number;
  lastModified: number;
}

export interface ReconstructionOptions {
  version?: number;
  timestamp?: number;
  includeSnapshots?: boolean;
  useCache?: boolean;
  applyTransforms?: boolean;
}

/**
 * Service for reconstructing document state from event stream
 */
export class DocumentReconstructor {
  private documentCache = new Map<string, { 
    document: DocumentState;
    expiresAt: number;
  }>();
  
  private readonly CACHE_TTL_MS = 60 * 1000; // 1 minute
  private readonly MAX_CACHE_SIZE = 100;
  
  constructor(
    private eventStore: EventStore,
    private snapshotStore: SnapshotStore,
    private operationalTransform: OperationalTransform,
    private metricsCollector: MetricsCollector
  ) {}

  /**
   * Reconstruct document state from events and snapshots
   */
  async reconstructDocument(documentId: string, targetVersion?: number): Promise<any> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot reconstruct document: No tenant context available');
    }

    try {
      // Get the latest snapshot
      const snapshot = await this.snapshotStore.getLatestSnapshot(documentId, tenantContext.tenantId);

      // Determine the starting version
      const startVersion = snapshot ? snapshot.version : 0;

      // Replay events from the starting version
      const events = await this.eventStore.replayEvents(documentId, startVersion);

      if (events.length === 0 && !snapshot) {
        throw new Error(`Document not found: ${documentId}`);
      }

      // Apply events to reconstruct the document state
      let documentState = snapshot 
        ? this.snapshotToDocumentState(snapshot)
        : { 
            content: '', 
            formatting: {}, 
            metadata: { 
              createdAt: new Date().toISOString(),
              version: 0
            }, 
            version: startVersion 
          };

      for (const event of events) {
        if (targetVersion !== undefined && event.version !== undefined && event.version > targetVersion) break;
        documentState = this.applyEvent(documentState, event);
      }

      // Record reconstruction latency
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('document.reconstruction', duration);
      await this.metricsCollector.track('document.events.count', events.length);

      // Create a snapshot if necessary
      if (await this.shouldCreateSnapshot(documentId, startVersion, events.length)) {
        try {
          await this.snapshotStore.createSnapshot(documentId, tenantContext.tenantId, documentState, { version: documentState.version, timestamp: Date.now() });
          await this.metricsCollector.increment('document.snapshot.created', 1);
        } catch (error) {
          console.error('Failed to create snapshot:', error);
          await this.metricsCollector.increment('document.snapshot.failed', 1);
        }
      }

      return documentState;
    } catch (error) {
      console.error('Error reconstructing document:', error);
      await this.metricsCollector.increment('document.reconstruction.failed', 1);
      throw error;
    }
  }

  /**
   * Determine if a snapshot should be created based on event count and access patterns
   */
  private async shouldCreateSnapshot(documentId: string, snapshotVersion: number, eventCount: number): Promise<boolean> {
    try {
      // Create snapshot if there are many events since the last snapshot
      if (eventCount > 50) {
        return true;
      }

      // Create snapshot if the document is frequently accessed
      const accessCount = await this.metricsCollector.getCountValue(`document.access.count.${documentId}`);
      if (accessCount > 10) {
        return true;
      }

      // Check average reconstruction time
      const avgTime = await this.metricsCollector.getAverageValue('document.reconstruction');
      if (avgTime > 20) { // If reconstruction takes more than 20ms on average
        return true;
      }

      return false;
    } catch (error) {
      console.error('Error determining if snapshot should be created:', error);
      return false;
    }
  }

  /**
   * Apply an event to the document state
   */
  private applyEvent(documentState: any, event: Event): any {
    try {
      switch (event.type) {
        case 'DOCUMENT_CREATED':
          return {
            ...documentState,
            content: event.payload.content || '',
            metadata: {
              ...documentState.metadata,
              ...event.payload.metadata,
              title: event.payload.title,
              createdAt: event.timestamp,
              lastModifiedAt: event.timestamp,
              createdBy: event.userId
            },
            version: event.version
          };

        case 'INSERT_TEXT':
          return {
            ...documentState,
            content: OperationalTransform.apply(documentState.content, {
              type: 'insert',
              position: event.payload.position,
              text: event.payload.text,
              userId: event.userId,
              timestamp: event.timestamp
            }),
            metadata: {
              ...documentState.metadata,
              lastModifiedAt: event.timestamp,
              lastModifiedBy: event.userId
            },
            version: event.version
          };

        case 'DELETE_TEXT':
          return {
            ...documentState,
            content: OperationalTransform.apply(documentState.content, {
              type: 'delete',
              position: event.payload.position,
              length: event.payload.length,
              userId: event.userId,
              timestamp: event.timestamp
            }),
            metadata: {
              ...documentState.metadata,
              lastModifiedAt: event.timestamp,
              lastModifiedBy: event.userId
            },
            version: event.version
          };

        case 'FORMAT_TEXT':
          const formattingKey = `${event.payload.position}:${event.payload.length}`;
          return {
            ...documentState,
            formatting: {
              ...documentState.formatting,
              [formattingKey]: event.payload.attributes
            },
            metadata: {
              ...documentState.metadata,
              lastModifiedAt: event.timestamp,
              lastModifiedBy: event.userId
            },
            version: event.version
          };

        case 'SET_METADATA':
          return {
            ...documentState,
            metadata: {
              ...documentState.metadata,
              [event.payload.key]: event.payload.value,
              lastModifiedAt: event.timestamp,
              lastModifiedBy: event.userId
            },
            version: event.version
          };

        default:
          console.warn(`Unsupported event type: ${event.type}`);
          return {
            ...documentState,
            version: event.version
          };
      }
    } catch (error) {
      console.error(`Error applying event ${event.type}:`, error);
      // Return state without changes on error
      return {
        ...documentState,
        version: event.version,
        errors: [
          ...(documentState.errors || []),
          { 
            eventType: event.type, 
            eventId: event.id, 
            error: error instanceof Error ? error.message : String(error)
          }
        ]
      };
    }
  }

  /**
   * Create a snapshot of the current document state
   * @param documentId Document identifier
   * @returns Created snapshot
   */
  async createSnapshot(documentId: string): Promise<Snapshot> {
    const document = await this.reconstructDocument(documentId);
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot create snapshot: No tenant context available');
    }
    
    const snapshot = await this.snapshotStore.createSnapshot(
      documentId,
      tenantContext.tenantId,
      {
        content: document.content,
        formatting: document.formatting,
        metadata: document.metadata
      },
      { version: document.version, timestamp: Date.now() }
    );
    
    await this.metricsCollector.increment('document.snapshot.created', 1, {
      documentId,
      version: document.version.toString()
    });
    
    // Invalidate cache after snapshot creation
    this.invalidateDocumentCache(documentId);
    
    return snapshot;
  }
  
  /**
   * Convert a snapshot to document state
   * @private
   */
  private snapshotToDocumentState(snapshot: Snapshot): DocumentState {
    return {
      documentId: snapshot.documentId,
      content: snapshot.content || '',
      formatting: snapshot.formatting || {},
      metadata: snapshot.metadata || {},
      version: snapshot.version,
      lastModified: snapshot.timestamp
    };
  }
  
  /**
   * Create an empty document state
   * @private
   */
  private createEmptyDocument(documentId: string): DocumentState {
    return {
      documentId,
      content: '',
      formatting: {},
      metadata: {},
      version: 0,
      lastModified: Date.now()
    };
  }
  
  /**
   * Cache a document for faster retrieval
   * @private
   */
  private cacheDocument(key: string, document: DocumentState): void {
    // Clean up old entries if the cache is too big
    if (this.documentCache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.documentCache.keys().next().value;
      this.documentCache.delete(oldestKey);
    }
    
    // Cache the document with an expiration time
    this.documentCache.set(key, {
      document: { ...document },
      expiresAt: Date.now() + this.CACHE_TTL_MS
    });
  }
  
  /**
   * Get a document from cache if it exists and is not expired
   * @private
   */
  private getCachedDocument(key: string): DocumentState | null {
    const cached = this.documentCache.get(key);
    
    if (!cached) {
      return null;
    }
    
    // Check if cache entry has expired
    if (cached.expiresAt < Date.now()) {
      this.documentCache.delete(key);
      return null;
    }
    
    return { ...cached.document };
  }
  
  /**
   * Invalidate cache entries for a document
   * @private
   */
  private invalidateDocumentCache(documentId: string): void {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return;
    
    const prefix = `${tenantContext.tenantId}:${documentId}:`;
    
    // Remove all cache entries for this document
    for (const key of this.documentCache.keys()) {
      if (key.startsWith(prefix)) {
        this.documentCache.delete(key);
      }
    }
  }
}