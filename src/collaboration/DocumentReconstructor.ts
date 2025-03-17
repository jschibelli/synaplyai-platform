import { EventStore, Event } from './events/EventStore';
import { SnapshotStore, Snapshot } from './snapshots/SnapshotStore';
import { OperationalTransform, Operation } from './conflict/OperationalTransform';
import { MetricsCollector } from '../metrics/collector';
import { getTenantContext } from '../lib/tenant-context';

interface DocumentState {
  content: string;
  formatting: Record<string, any>;
  metadata: Record<string, any>;
  version: number;
}

/**
 * Reconstructs document state from events with snapshot optimization
 */
export class DocumentReconstructor {
  constructor(
    private eventStore: EventStore,
    private snapshotStore: SnapshotStore,
    private operationalTransform: OperationalTransform,
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Reconstructs document state from events with snapshot optimization
   * 
   * @param documentId Document identifier
   * @param toVersion Target version to reconstruct (optional, defaults to latest)
   * @returns Reconstructed document state
   */
  async reconstructDocument(documentId: string, toVersion?: number): Promise<DocumentState> {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot reconstruct document: No tenant context available');
    }
    
    const startTime = performance.now();
    
    try {
      // First try to get the latest snapshot before target version
      const snapshot = await this.snapshotStore.getLatestSnapshot(documentId);
      
      // Start with snapshot state or empty state
      let state: DocumentState = snapshot?.state || {
        content: '',
        formatting: {},
        metadata: {},
        version: 0
      };
      
      // If we have a snapshot, only replay events after the snapshot version
      const fromVersion = snapshot ? snapshot.version : 0;
      
      // Replay events to reconstruct current state
      const events = await this.eventStore.replayEvents(documentId, fromVersion);
      
      // Filter events up to target version if specified
      const filteredEvents = toVersion !== undefined 
        ? events.filter(event => event.version <= toVersion)
        : events;
      
      // Apply events to state
      for (const event of filteredEvents) {
        state = this.applyEvent(state, event);
      }
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('document.reconstruction', duration);
      await this.metricsCollector.track('document.reconstructed', 1, {
        tenantId: tenantContext.tenantId,
        documentId,
        fromSnapshot: Boolean(snapshot),
        eventCount: filteredEvents.length
      });
      
      // Check if we should create a snapshot based on performance or event count
      if (duration > 50 || filteredEvents.length > 50) {
        this.createSnapshotInBackground(documentId, state).catch(error => {
          console.error('Failed to create document snapshot:', error);
        });
      }
      
      return state;
    } catch (error) {
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('document.reconstruction.error', duration);
      throw error;
    }
  }
  
  /**
   * Applies an event to the document state
   * 
   * @param state Current document state
   * @param event Event to apply
   * @returns Updated document state
   */
  private applyEvent(state: DocumentState, event: Event): DocumentState {
    // Start with a copy of the current state
    const newState = { ...state };
    
    // Update version
    newState.version = event.version;
    
    // Apply different event types
    switch (event.type) {
      case 'INSERT_TEXT':
        return this.applyInsertText(newState, event);
        
      case 'DELETE_TEXT':
        return this.applyDeleteText(newState, event);
        
      case 'FORMAT_TEXT':
        return this.applyFormatText(newState, event);
        
      case 'SET_METADATA':
        return this.applySetMetadata(newState, event);
        
      default:
        // Unknown event type, just return state as is
        console.warn(`Unknown event type: ${event.type}`);
        return newState;
    }
  }
  
  /**
   * Applies INSERT_TEXT event
   */
  private applyInsertText(state: DocumentState, event: Event): DocumentState {
    const operation: Operation = {
      type: 'insert',
      position: event.payload.position,
      content: event.payload.text
    };
    
    const newContent = this.operationalTransform.applyOperation(
      state.content, 
      operation
    );
    
    return {
      ...state,
      content: newContent
    };
  }
  
  /**
   * Applies DELETE_TEXT event
   */
  private applyDeleteText(state: DocumentState, event: Event): DocumentState {
    const operation: Operation = {
      type: 'delete',
      position: event.payload.position,
      length: event.payload.length
    };
    
    const newContent = this.operationalTransform.applyOperation(
      state.content, 
      operation
    );
    
    return {
      ...state,
      content: newContent
    };
  }
  
  /**
   * Applies FORMAT_TEXT event
   */
  private applyFormatText(state: DocumentState, event: Event): DocumentState {
    const { position, length, attributes } = event.payload;
    const formattingKey = `${position}:${length}`;
    
    return {
      ...state,
      formatting: {
        ...state.formatting,
        [formattingKey]: {
          ...state.formatting[formattingKey],
          ...attributes
        }
      }
    };
  }
  
  /**
   * Applies SET_METADATA event
   */
  private applySetMetadata(state: DocumentState, event: Event): DocumentState {
    const { key, value } = event.payload;
    
    return {
      ...state,
      metadata: {
        ...state.metadata,
        [key]: value
      }
    };
  }
  
  /**
   * Creates a snapshot in the background
   * 
   * @param documentId Document identifier
   * @param state Current document state
   */
  private async createSnapshotInBackground(documentId: string, state: DocumentState): Promise<void> {
    try {
      // Check if we should create a new snapshot
      const shouldCreateSnapshot = await this.snapshotStore.shouldCreateSnapshot(documentId);
      
      if (shouldCreateSnapshot) {
        await this.snapshotStore.createSnapshot(documentId, state, state.version);
        
        await this.metricsCollector.track('document.snapshot.created', 1, {
          documentId,
          version: state.version
        });
      }
    } catch (error) {
      console.error('Failed to create snapshot:', error);
      await this.metricsCollector.track('document.snapshot.error', 1, {
        documentId,
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Gets document at a specific point in time
   * 
   * @param documentId Document identifier
   * @param timestamp Timestamp to reconstruct at
   * @returns Document state at the specified time
   */
  async getDocumentAtTime(documentId: string, timestamp: number): Promise<DocumentState> {
    // Find the version at or before the specified timestamp
    const events = await this.eventStore.getEventsBeforeTime(documentId, timestamp);
    
    if (events.length === 0) {
      return {
        content: '',
        formatting: {},
        metadata: {},
        version: 0
      };
    }
    
    // Get the latest version before or at the timestamp
    const targetVersion = events[events.length - 1].version;
    
    // Reconstruct document to that version
    return this.reconstructDocument(documentId, targetVersion);
  }
}