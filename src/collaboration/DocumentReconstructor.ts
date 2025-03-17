import { EventStore, Event } from './events/EventStore';
import { SnapshotStore, Snapshot } from './snapshots/SnapshotStore';
import { OperationalTransform } from './conflict/OperationalTransform';
import { MetricsCollector } from '../metrics/collector';
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
 * Responsible for reconstructing document state from events
 * and managing snapshots for optimization
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
   * @param documentId Document identifier
   * @param options Reconstruction options
   * @returns Reconstructed document state
   */
  async reconstructDocument(
    documentId: string,
    options: ReconstructionOptions = {}
  ): Promise<DocumentState> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot reconstruct document: No tenant context available');
    }
    
    try {
      const cacheKey = `${tenantContext.tenantId}:${documentId}:${options.version || 'latest'}`;
      
      // Check cache first if enabled
      if (options.useCache !== false) {
        const cachedDocument = this.getCachedDocument(cacheKey);
        if (cachedDocument) {
          // Return cached document if available
          return cachedDocument;
        }
      }
      
      let document: DocumentState;
      let startingVersion = 0;
      
      // Use snapshot if available and not explicitly disabled
      if (options.includeSnapshots !== false) {
        const snapshot = options.version 
          ? await this.snapshotStore.getSnapshotAtVersion(documentId, options.version)
          : await this.snapshotStore.getLatestSnapshot(documentId);
          
        if (snapshot) {
          // Start from snapshot state
          document = this.snapshotToDocumentState(snapshot);
          startingVersion = snapshot.version;
          
          await this.metricsCollector.increment('document.reconstruction.fromSnapshot', 1, {
            documentId,
            snapshotVersion: snapshot.version.toString()
          });
        } else {
          // No snapshot available, start with empty document
          document = this.createEmptyDocument(documentId);
          await this.metricsCollector.increment('document.reconstruction.fromScratch', 1, {
            documentId
          });
        }
      } else {
        // Snapshots explicitly disabled, start with empty document
        document = this.createEmptyDocument(documentId);
        await this.metricsCollector.increment('document.reconstruction.fromScratch', 1, {
          documentId
        });
      }
      
      // Get events after snapshot version
      const events = await this.eventStore.replayEvents(
        documentId, 
        startingVersion + 1,
        { useCache: options.useCache }
      );
      
      // Apply each event to build up the document state
      for (const event of events) {
        // Stop at target version if specified
        if (options.version !== undefined && event.version && event.version > options.version) {
          break;
        }
        
        // Stop at target timestamp if specified
        if (options.timestamp !== undefined && event.timestamp && event.timestamp > options.timestamp) {
          break;
        }
        
        // Apply the event to document state
        document = this.applyEvent(document, event, options.applyTransforms);
      }
      
      // Cache the reconstructed document if caching is enabled
      if (options.useCache !== false) {
        this.cacheDocument(cacheKey, document);
      }
      
      // Check if we should create a new snapshot
      this.checkAndCreateSnapshot(documentId, document);
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('document.reconstruction', duration, {
        documentId,
        eventsApplied: events.length.toString()
      });
      
      return document;
    } catch (error) {
      // Log and re-throw the error
      await this.metricsCollector.increment('document.reconstruction.error', 1, {
        documentId,
        errorType: error instanceof Error ? error.name : 'unknown'
      });
      
      console.error('Error reconstructing document:', error);
      throw error;
    }
  }
  
  /**
   * Create a snapshot of the current document state
   * @param documentId Document identifier
   * @returns Created snapshot
   */
  async createSnapshot(documentId: string): Promise<Snapshot> {
    const document = await this.reconstructDocument(documentId);
    
    const snapshot = await this.snapshotStore.createSnapshot(
      documentId,
      {
        content: document.content,
        formatting: document.formatting,
        metadata: document.metadata
      },
      document.version
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
   * Apply an event to the document state
   * @private
   */
  private applyEvent(document: DocumentState, event: Event, applyTransforms = true): DocumentState {
    // Create a copy to avoid modifying original
    const updatedDocument = { ...document };
    
    // Update version
    if (event.version) {
      updatedDocument.version = event.version;
    }
    
    // Update last modified timestamp
    if (event.timestamp) {
      updatedDocument.lastModified = event.timestamp;
    }
    
    // Apply event based on type
    switch (event.type) {
      case 'DOCUMENT_CREATED':
        return this.handleDocumentCreated(updatedDocument, event);
        
      case 'INSERT_TEXT':
        return this.handleInsertText(updatedDocument, event, applyTransforms);
        
      case 'DELETE_TEXT':
        return this.handleDeleteText(updatedDocument, event, applyTransforms);
        
      case 'FORMAT_TEXT':
        return this.handleFormatText(updatedDocument, event);
        
      case 'SET_METADATA':
        return this.handleSetMetadata(updatedDocument, event);
        
      default:
        console.warn(`Unknown event type: ${event.type}`);
        return updatedDocument;
    }
  }
  
  /**
   * Handle DOCUMENT_CREATED event
   * @private
   */
  private handleDocumentCreated(document: DocumentState, event: Event): DocumentState {
    return {
      ...document,
      content: event.payload.content || '',
      metadata: {
        ...document.metadata,
        title: event.payload.title || 'Untitled Document',
        createdBy: event.userId,
        createdAt: event.timestamp,
        ...event.payload.metadata
      }
    };
  }
  
  /**
   * Handle INSERT_TEXT event
   * @private
   */
  private handleInsertText(document: DocumentState, event: Event, applyTransforms: boolean): DocumentState {
    const { position, text } = event.payload;
    
    if (typeof position !== 'number' || typeof text !== 'string') {
      console.warn('Invalid INSERT_TEXT event payload:', event.payload);
      return document;
    }
    
    let newContent: string;
    
    if (applyTransforms) {
      // Apply operational transform if needed
      const operation = {
        type: 'insert',
        position,
        content: text
      };
      
      const metadata = event.metadata || {};
      if (metadata.vectorClock) {
        // TODO: Apply operational transform using vector clock
        // This would transform the operation against concurrent operations
        // For now, we're just applying the operation directly
      }
      
      newContent = 
        document.content.substring(0, position) + 
        text + 
        document.content.substring(position);
    } else {
      // Simple insert without transforms
      newContent = 
        document.content.substring(0, position) + 
        text + 
        document.content.substring(position);
    }
    
    return {
      ...document,
      content: newContent
    };
  }
  
  /**
   * Handle DELETE_TEXT event
   * @private
   */
  private handleDeleteText(document: DocumentState, event: Event, applyTransforms: boolean): DocumentState {
    const { position, length } = event.payload;
    
    if (typeof position !== 'number' || typeof length !== 'number') {
      console.warn('Invalid DELETE_TEXT event payload:', event.payload);
      return document;
    }
    
    let newContent: string;
    
    if (applyTransforms) {
      // Apply operational transform if needed
      const operation = {
        type: 'delete',
        position,
        length
      };
      
      const metadata = event.metadata || {};
      if (metadata.vectorClock) {
        // TODO: Apply operational transform using vector clock
        // For now, we're just applying the operation directly
      }
      
      newContent = 
        document.content.substring(0, position) + 
        document.content.substring(position + length);
    } else {
      // Simple delete without transforms
      newContent = 
        document.content.substring(0, position) + 
        document.content.substring(position + length);
    }
    
    return {
      ...document,
      content: newContent
    };
  }
  
  /**
   * Handle FORMAT_TEXT event
   * @private
   */
  private handleFormatText(document: DocumentState, event: Event): DocumentState {
    const { position, length, attributes } = event.payload;
    
    if (
      typeof position !== 'number' || 
      typeof length !== 'number' || 
      !attributes
    ) {
      console.warn('Invalid FORMAT_TEXT event payload:', event.payload);
      return document;
    }
    
    // Create a copy of formatting
    const newFormatting = { ...document.formatting };
    
    // Create a range key for this formatting
    const rangeKey = `${position}:${position + length}`;
    
    // Update or set formatting for this range
    newFormatting[rangeKey] = {
      ...(newFormatting[rangeKey] || {}),
      ...attributes
    };
    
    return {
      ...document,
      formatting: newFormatting
    };
  }
  
  /**
   * Handle SET_METADATA event
   * @private
   */
  private handleSetMetadata(document: DocumentState, event: Event): DocumentState {
    const { metadata } = event.payload;
    
    if (!metadata || typeof metadata !== 'object') {
      console.warn('Invalid SET_METADATA event payload:', event.payload);
      return document;
    }
    
    return {
      ...document,
      metadata: {
        ...document.metadata,
        ...metadata,
        lastModifiedBy: event.userId,
        lastModifiedAt: event.timestamp
      }
    };
  }
  
  /**
   * Convert a snapshot to document state
   * @private
   */
  private snapshotToDocumentState(snapshot: Snapshot): DocumentState {
    return {
      documentId: snapshot.documentId,
      content: snapshot.state.content || '',
      formatting: snapshot.state.formatting || {},
      metadata: snapshot.state.metadata || {},
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
   * Check if we should create a new snapshot and create one if needed
   * @private
   */
  private async checkAndCreateSnapshot(documentId: string, document: DocumentState): Promise<void> {
    try {
      // Use the snapshot store to determine if we should create a snapshot
      const shouldCreateSnapshot = await this.snapshotStore.shouldCreateSnapshot(documentId);
      
      if (shouldCreateSnapshot) {
        // Create snapshot asynchronously without blocking the document reconstruction
        this.snapshotStore.createSnapshot(
          documentId,
          {
            content: document.content,
            formatting: document.formatting,
            metadata: document.metadata
          },
          document.version
        ).catch(error => {
          console.error('Failed to create snapshot:', error);
        });
        
        await this.metricsCollector.increment('document.snapshot.triggered', 1, {
          documentId,
          version: document.version.toString()
        });
      }
    } catch (error) {
      console.error('Error checking if snapshot should be created:', error);
    }
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