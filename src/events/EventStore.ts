import { createHash } from 'crypto';
import { Worker } from 'worker_threads';
import { getTenantContext } from '../lib/tenantContext';
import { ComplianceLogger } from '../compliance/logger';
import { prisma } from '../prisma/client';

/**
 * Schema version information for event compatibility
 */
export interface SchemaVersion {
  /** Version identifier */
  version: string;
  /** SHA-256 hash of the schema */
  schemaHash: string;
}

/**
 * Base event interface that all events must implement
 */
export interface BaseEvent {
  /** Unique identifier for the event */
  id?: string;
  /** Type of the event */
  type: string;
  /** Aggregate/entity identifier the event belongs to */
  aggregateId: string;
  /** Version number for the aggregate after applying this event */
  aggregateVersion: number;
  /** Timestamp when the event occurred */
  timestamp: string;
  /** Schema version information */
  schemaVersion: SchemaVersion;
  /** User who initiated the action that led to this event */
  userId: string;
  /** Tenant identifier for multi-tenant isolation */
  tenantId: string;
  /** Transaction identifier for grouping related events */
  transactionId: string;
  /** Vector clock for establishing event order across distributed systems */
  vectorClock: Record<string, number>;
}

/**
 * Configuration options for the event store
 */
export interface EventStoreConfig {
  /** How often to take snapshots (number of events) */
  snapshotFrequency: number;
  /** Maximum parallel snapshot jobs */
  maxParallelSnapshots: number;
  /** Whether to validate schema hash during event ingestion */
  validateSchemaHash: boolean;
  /** Whether to use worker threads for snapshot creation */
  useWorkerThreads: boolean;
}

/**
 * Snapshot of an aggregate's state at a specific version
 */
export interface Snapshot<T = any> {
  /** Aggregate/entity identifier */
  aggregateId: string;
  /** Version of the aggregate when the snapshot was taken */
  aggregateVersion: number;
  /** Tenant identifier */
  tenantId: string;
  /** Timestamp when the snapshot was created */
  timestamp: string;
  /** The actual state data */
  state: T;
  /** Hash of the state for integrity verification */
  stateHash: string;
  /** Schema version information */
  schemaVersion: SchemaVersion;
}

/**
 * Event replay options to control how events are loaded and processed
 */
export interface EventReplayOptions {
  /** Maximum number of events to load at once */
  batchSize?: number;
  /** Whether to use snapshots when available */
  useSnapshots?: boolean;
  /** Custom event handlers for replaying events */
  eventHandlers?: Record<string, (state: any, event: BaseEvent) => any>;
}

/**
 * Event store for storing and retrieving events with schema versioning
 * and adaptive snapshotting capabilities
 */
export class EventStore {
  private config: EventStoreConfig;
  private snapshotInProgress = new Set<string>();
  private eventHandlers = new Map<string, (state: any, event: BaseEvent) => any>();
  
  /**
   * Creates a new event store
   * @param config Configuration options
   */
  constructor(config: Partial<EventStoreConfig> = {}) {
    this.config = {
      snapshotFrequency: 100,
      maxParallelSnapshots: 2,
      validateSchemaHash: true,
      useWorkerThreads: false,
      ...config
    };
  }
  
  /**
   * Register an event handler for replaying events
   * @param eventType Type of event to handle
   * @param handler Function that applies the event to the state
   */
  registerEventHandler<T = any>(
    eventType: string,
    handler: (state: T, event: BaseEvent) => T
  ): void {
    this.eventHandlers.set(eventType, handler as any);
  }
  
  /**
   * Append a single event to the store
   * @param event Event to store
   * @returns The stored event with generated ID
   */
  async appendEvent<T extends BaseEvent>(event: T): Promise<T> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot append event: No tenant context available');
    }
    
    // Ensure event has tenant isolation
    if (event.tenantId !== tenantContext.tenantId) {
      throw new Error(`Event tenantId (${event.tenantId}) does not match context (${tenantContext.tenantId})`);
    }
    
    // Validate schema hash if configured
    if (this.config.validateSchemaHash) {
      await this.validateEventSchema(event);
    }
    
    // Generate event ID if not provided
    const eventWithId = {
      ...event,
      id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
    };
    
    // Store the event in the database
    const storedEvent = await prisma.event.create({
      data: {
        id: eventWithId.id,
        type: event.type,
        aggregateId: event.aggregateId,
        aggregateVersion: event.aggregateVersion,
        tenantId: event.tenantId,
        userId: event.userId,
        timestamp: new Date(event.timestamp),
        transactionId: event.transactionId,
        vectorClock: JSON.stringify(event.vectorClock),
        schemaVersion: JSON.stringify(event.schemaVersion),
        payload: JSON.stringify(event)
      }
    });
    
    // Log to compliance for audit trail
    await ComplianceLogger.log({
      eventType: `event.stored.${event.type}`,
      resourceId: event.aggregateId,
      userId: event.userId,
      description: `Event ${event.type} stored for ${event.aggregateId}`,
      metadata: {
        eventId: eventWithId.id,
        aggregateVersion: event.aggregateVersion,
        transactionId: event.transactionId
      }
    });
    
    // Check if we should create a snapshot
    this.checkAndCreateSnapshot(event);
    
    return eventWithId;
  }
  
  /**
   * Append multiple events in a single transaction
   * @param events Events to store
   * @returns The stored events with generated IDs
   */
  async appendEvents<T extends BaseEvent>(events: T[]): Promise<T[]> {
    if (events.length === 0) return [];
    
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot append events: No tenant context available');
    }
    
    // Ensure all events are for the same tenant and aggregate
    const firstEvent = events[0];
    const aggregateId = firstEvent.aggregateId;
    const tenantId = firstEvent.tenantId;
    
    if (tenantId !== tenantContext.tenantId) {
      throw new Error(`Events tenantId (${tenantId}) does not match context (${tenantContext.tenantId})`);
    }
    
    if (!events.every(e => e.aggregateId === aggregateId && e.tenantId === tenantId)) {
      throw new Error('All events must be for the same aggregate and tenant');
    }
    
    // Process all events in a transaction
    return await prisma.$transaction(async (tx) => {
      const storedEvents: T[] = [];
      
      for (const event of events) {
        // Validate schema if configured
        if (this.config.validateSchemaHash) {
          await this.validateEventSchema(event);
        }
        
        // Generate event ID if not provided
        const eventWithId = {
          ...event,
          id: event.id || `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
        };
        
        // Store the event
        await tx.event.create({
          data: {
            id: eventWithId.id,
            type: event.type,
            aggregateId: event.aggregateId,
            aggregateVersion: event.aggregateVersion,
            tenantId: event.tenantId,
            userId: event.userId,
            timestamp: new Date(event.timestamp),
            transactionId: event.transactionId,
            vectorClock: JSON.stringify(event.vectorClock),
            schemaVersion: JSON.stringify(event.schemaVersion),
            payload: JSON.stringify(event)
          }
        });
        
        storedEvents.push(eventWithId);
      }
      
      // Check if we should create a snapshot
      const lastEvent = events[events.length - 1];
      this.checkAndCreateSnapshot(lastEvent);
      
      return storedEvents;
    });
  }
  
  /**
   * Get events for an aggregate starting from a specific version
   * @param aggregateId Aggregate identifier
   * @param fromVersion Starting version (inclusive)
   * @param toVersion Ending version (inclusive, optional)
   * @returns Array of events
   */
  async getEvents<T extends BaseEvent>(
    aggregateId: string, 
    fromVersion = 1,
    toVersion?: number
  ): Promise<T[]> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get events: No tenant context available');
    }
    
    const where = {
      aggregateId,
      tenantId: tenantContext.tenantId,
      aggregateVersion: {
        gte: fromVersion,
        ...(toVersion ? { lte: toVersion } : {})
      }
    };
    
    const events = await prisma.event.findMany({
      where,
      orderBy: { aggregateVersion: 'asc' }
    });
    
    // Parse the events from JSON
    return events.map(event => JSON.parse(event.payload) as T);
  }
  
  /**
   * Get the latest snapshot for an aggregate
   * @param aggregateId Aggregate identifier
   * @returns The latest snapshot or null if no snapshot exists
   */
  async getLatestSnapshot<T = any>(aggregateId: string): Promise<Snapshot<T> | null> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get snapshot: No tenant context available');
    }
    
    const snapshot = await prisma.snapshot.findFirst({
      where: {
        aggregateId,
        tenantId: tenantContext.tenantId
      },
      orderBy: { aggregateVersion: 'desc' }
    });
    
    if (!snapshot) return null;
    
    // Parse and return the snapshot
    return {
      aggregateId: snapshot.aggregateId,
      aggregateVersion: snapshot.aggregateVersion,
      tenantId: snapshot.tenantId,
      timestamp: snapshot.timestamp.toISOString(),
      state: JSON.parse(snapshot.state),
      stateHash: snapshot.stateHash,
      schemaVersion: JSON.parse(snapshot.schemaVersion)
    };
  }
  
  /**
   * Create a snapshot of the aggregate state
   * @param aggregateId Aggregate identifier
   * @param aggregateVersion Version of the aggregate
   * @param state State to snapshot
   * @param schemaVersion Schema version information
   */
  async createSnapshot<T>(
    aggregateId: string,
    aggregateVersion: number,
    state: T,
    schemaVersion: SchemaVersion
  ): Promise<void> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot create snapshot: No tenant context available');
    }
    
    const tenantId = tenantContext.tenantId;
    const stateString = JSON.stringify(state);
    const stateHash = createHash('sha256').update(stateString).digest('hex');
    
    await prisma.snapshot.create({
      data: {
        aggregateId,
        aggregateVersion,
        tenantId,
        timestamp: new Date(),
        state: stateString,
        stateHash,
        schemaVersion: JSON.stringify(schemaVersion)
      }
    });
    
    // Log snapshot creation to compliance
    await ComplianceLogger.log({
      eventType: 'snapshot.created',
      resourceId: aggregateId,
      description: `Snapshot created for ${aggregateId} at version ${aggregateVersion}`,
      metadata: {
        aggregateVersion,
        stateHash,
        schemaVersion
      }
    });
  }
  
  /**
   * Validate that an event's schema hash matches expected value
   * @param event Event to validate
   * @private
   */
  private async validateEventSchema<T extends BaseEvent>(event: T): Promise<void> {
    // In a real implementation, you would fetch the current schema hash for the event type
    // and compare it with the event's schema hash
    const expectedSchemaHash = await this.getSchemaHashForEventType(event.type);
    
    if (expectedSchemaHash && event.schemaVersion.schemaHash !== expectedSchemaHash) {
      throw new Error(`Schema hash mismatch for event type ${event.type}: Expected ${expectedSchemaHash} but got ${event.schemaVersion.schemaHash}`);
    }
  }
  
  /**
   * Get the current schema hash for an event type
   * @param eventType Event type
   * @private
   */
  private async getSchemaHashForEventType(eventType: string): Promise<string | null> {
    // In a real implementation, this would fetch from a schema registry
    // For now, we'll return null to allow any schema hash
    return null;
  }
  
  /**
   * Check if we should create a snapshot and initiate snapshot creation if needed
   * @param event Event that may trigger a snapshot
   * @private
   */
  private checkAndCreateSnapshot<T extends BaseEvent>(event: T): void {
    // Check if we need a snapshot based on the event's aggregate version
    if (event.aggregateVersion % this.config.snapshotFrequency === 0) {
      const snapshotKey = `${event.tenantId}:${event.aggregateId}`;
      
      // Skip if a snapshot is already in progress for this aggregate
      if (this.snapshotInProgress.has(snapshotKey)) {
        return;
      }
      
      // Check if we've reached the maximum number of parallel snapshots
      if (this.snapshotInProgress.size >= this.config.maxParallelSnapshots) {
        console.log(`Skipping snapshot for ${event.aggregateId}: Maximum parallel snapshots reached`);
        return;
      }
      
      // Mark snapshot as in progress
      this.snapshotInProgress.add(snapshotKey);
      
      // Create snapshot in a separate worker thread to avoid blocking
      this.createSnapshotInWorker(event).finally(() => {
        this.snapshotInProgress.delete(snapshotKey);
      });
    }
  }
  
  /**
   * Create a snapshot in a separate worker thread
   * @param event Event that triggered the snapshot
   * @private
   */
  private async createSnapshotInWorker<T extends BaseEvent>(event: T): Promise<void> {
    try {
      if (this.config.useWorkerThreads) {
        // Implementation using real worker threads would go here
        // For now, we'll directly create the snapshot in the main thread
        await this.createSnapshotDirectly(event);
      } else {
        // Simulate by fetching all events and creating a snapshot in the main thread
        await this.createSnapshotDirectly(event);
      }
    } catch (error) {
      console.error(`Failed to create snapshot for ${event.aggregateId}:`, error);
    }
  }
  
  /**
   * Create a snapshot directly in the current thread
   * @param event Event that triggered the snapshot
   * @private
   */
  private async createSnapshotDirectly<T extends BaseEvent>(event: T): Promise<void> {
    // Get all events for the aggregate
    const events = await this.getEvents(event.aggregateId);
    
    // Rebuild the state from events
    const state = this.rebuildStateFromEvents(events);
    
    // Create the snapshot
    await this.createSnapshot(
      event.aggregateId,
      event.aggregateVersion,
      state,
      event.schemaVersion
    );
    
    console.log(`Snapshot created for ${event.aggregateId} at version ${event.aggregateVersion}`);
  }
  
  /**
   * Rebuild aggregate state from a series of events
   * @param events Events to replay
   * @returns Reconstructed state
   * @private
   */
  private rebuildStateFromEvents<T extends BaseEvent, S = any>(events: T[]): S {
    if (events.length === 0) {
      return {} as S;
    }
    
    // Start with an empty state
    let state = {};
    
    // Apply each event to the state
    for (const event of events) {
      // Use registered handler if available
      const handler = this.eventHandlers.get(event.type);
      
      if (handler) {
        state = handler(state, event);
      } else {
        // Default implementation if no handler is registered
        state = this.applyEventToState(state, event);
      }
    }
    
    return state as S;
  }
  
  /**
   * Default implementation for applying an event to state
   * @param state Current state
   * @param event Event to apply
   * @returns Updated state
   * @private
   */
  private applyEventToState<S>(state: S, event: BaseEvent): S {
    // This is a simple default implementation
    // In a real application, you would have specific logic for each event type
    
    // Extract the relevant payload from the event
    const { type, aggregateVersion, timestamp, ...payload } = event;
    
    // Create a new state with the event metadata
    return {
      ...state,
      lastEvent: type,
      version: aggregateVersion,
      lastModified: timestamp,
      // Merge any payload properties into the state
      ...payload
    } as S;
  }
  
  /**
   * Reconstruct an aggregate's state from events with optional snapshot optimization
   * @param aggregateId Aggregate identifier
   * @param options Options for controlling the replay process
   * @returns Reconstructed state
   */
  async reconstructState<S = any>(
    aggregateId: string,
    options: EventReplayOptions = {}
  ): Promise<S> {
    const useSnapshots = options.useSnapshots !== false;
    let fromVersion = 1;
    let state = {} as S;
    
    // Try to load the latest snapshot if enabled
    if (useSnapshots) {
      const snapshot = await this.getLatestSnapshot<S>(aggregateId);
      
      if (snapshot) {
        state = snapshot.state;
        fromVersion = snapshot.aggregateVersion + 1;
      }
    }
    
    // Get events after the snapshot
    const events = await this.getEvents(aggregateId, fromVersion);
    
    // No events and no snapshot means the aggregate doesn't exist
    if (events.length === 0 && fromVersion === 1) {
      throw new Error(`Aggregate ${aggregateId} not found`);
    }
    
    // If we have custom event handlers in options, use those temporarily
    const originalHandlers = new Map(this.eventHandlers);
    
    try {
      if (options.eventHandlers) {
        for (const [type, handler] of Object.entries(options.eventHandlers)) {
          this.eventHandlers.set(type, handler);
        }
      }
      
      // Apply events to the state
      for (const event of events) {
        // Use registered handler if available
        const handler = this.eventHandlers.get(event.type);
        
        if (handler) {
          state = handler(state, event) as S;
        } else {
          // Default implementation if no handler is registered
          state = this.applyEventToState(state, event);
        }
      }
      
      return state;
    } finally {
      // Restore original handlers
      this.eventHandlers = originalHandlers;
    }
  }
  
  /**
   * Get the current version of an aggregate
   * @param aggregateId Aggregate identifier
   * @returns Current version or 0 if the aggregate doesn't exist
   */
  async getCurrentVersion(aggregateId: string): Promise<number> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot get current version: No tenant context available');
    }
    
    const event = await prisma.event.findFirst({
      where: {
        aggregateId,
        tenantId: tenantContext.tenantId
      },
      orderBy: { aggregateVersion: 'desc' }
    });
    
    return event ? event.aggregateVersion : 0;
  }
  
  /**
   * Delete all events and snapshots for an aggregate (for testing/cleanup)
   * @param aggregateId Aggregate identifier
   * @returns Number of deleted events
   */
  async deleteAggregate(aggregateId: string): Promise<number> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot delete aggregate: No tenant context available');
    }
    
    const tenantId = tenantContext.tenantId;
    
    // Record the deletion for compliance
    await ComplianceLogger.log({
      eventType: 'aggregate.deleted',
      resourceId: aggregateId,
      description: `All events and snapshots deleted for aggregate ${aggregateId}`,
      metadata: { tenantId }
    });
    
    // Delete all events and snapshots in a transaction
    const { deletedEvents, deletedSnapshots } = await prisma.$transaction(async (tx) => {
      const deletedEvents = await tx.event.deleteMany({
        where: { aggregateId, tenantId }
      });
      
      const deletedSnapshots = await tx.snapshot.deleteMany({
        where: { aggregateId, tenantId }
      });
      
      return { deletedEvents, deletedSnapshots };
    });
    
    return deletedEvents.count;
  }
}