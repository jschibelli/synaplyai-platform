import { PrismaClient } from '@prisma/client';
import { MetricsCollector } from '../../metrics/collector';
import { getTenantContext } from '../../lib/tenant-context';
import { v4 as uuidv4 } from 'uuid';

export interface Event {
  id?: string;
  type: string;
  documentId: string;
  tenantId?: string;
  userId: string;
  payload: any;
  version?: number;
  timestamp?: number;
  metadata?: {
    schemaVersion: number | string;
    vectorClock?: Record<string, number>;
    transactionId?: string;
    commandId?: string;
    [key: string]: any;
  };
}

export interface EventQuery {
  documentId: string;
  fromVersion?: number;
  toVersion?: number;
  fromTimestamp?: number;
  toTimestamp?: number;
  limit?: number;
}

export interface EventStoreOptions {
  client?: any; // Transaction client
  useCache?: boolean;
}

/**
 * Responsible for storing and retrieving events with proper transaction boundaries
 */
export class EventStore {
  private eventCache = new Map<string, Event[]>();
  private maxCacheSize = 500;
  
  constructor(
    private prisma: PrismaClient,
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Store an event with appropriate transaction boundaries and tenant isolation
   * @param event Event to store
   * @param options Options for event storage
   * @returns Stored event with generated ID and version
   */
  async store(event: Event, options: EventStoreOptions = {}): Promise<Event> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    try {
      // Apply tenant context and generate ID if not provided
      const enrichedEvent = {
        ...event,
        id: event.id || `evt-${uuidv4()}`,
        tenantId: tenantContext.tenantId,
        timestamp: event.timestamp || Date.now()
      };
      
      // Determine the client (use transaction client if provided)
      const client = options.client || this.prisma;
      
      // Find the latest version for this document
      const latestEvent = await client.event.findFirst({
        where: {
          documentId: event.documentId,
          tenantId: tenantContext.tenantId
        },
        orderBy: {
          version: 'desc'
        },
        select: {
          version: true
        }
      });
      
      // Calculate new version
      const newVersion = latestEvent ? (latestEvent.version + 1) : 1;
      enrichedEvent.version = newVersion;
      
      // Store the event
      const storedEvent = await client.event.create({
        data: {
          id: enrichedEvent.id,
          type: enrichedEvent.type,
          documentId: enrichedEvent.documentId,
          tenantId: enrichedEvent.tenantId,
          userId: enrichedEvent.userId,
          payload: enrichedEvent.payload,
          version: enrichedEvent.version,
          timestamp: enrichedEvent.timestamp,
          metadata: enrichedEvent.metadata || {}
        }
      });
      
      // Update cache if caching is enabled
      if (options.useCache !== false) {
        this.updateEventCache(enrichedEvent.documentId, enrichedEvent);
      }
      
      // Track metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('event.store', duration);
      await this.metricsCollector.track('event.stored', 1, {
        eventType: enrichedEvent.type,
        documentId: enrichedEvent.documentId,
        tenantId: enrichedEvent.tenantId
      });
      
      return storedEvent;
    } catch (error) {
      // Track errors
      await this.metricsCollector.increment('event.store.error', 1);
      throw error;
    }
  }
  
  /**
   * Replay events for a document starting from a specific version
   * @param documentId Document identifier
   * @param fromVersion Starting version (inclusive), defaults to 0
   * @param options Query options
   * @returns Array of events in version order
   */
  async replayEvents(
    documentId: string,
    fromVersion: number = 0,
    options: EventStoreOptions = {}
  ): Promise<Event[]> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    try {
      // Check cache first if caching is enabled
      if (options.useCache !== false) {
        const cachedEvents = this.getEventsFromCache(documentId, fromVersion);
        if (cachedEvents) {
          return cachedEvents;
        }
      }
      
      // Determine the client (use transaction client if provided)
      const client = options.client || this.prisma;
      
      // Query events
      const events = await client.event.findMany({
        where: {
          documentId,
          tenantId: tenantContext.tenantId,
          version: {
            gte: fromVersion
          }
        },
        orderBy: {
          version: 'asc'
        }
      });
      
      // Update cache if caching is enabled
      if (options.useCache !== false && events.length > 0) {
        this.cacheEvents(documentId, events);
      }
      
      // Track metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('event.replay', duration);
      await this.metricsCollector.track('event.replayed', 1, {
        documentId,
        tenantId: tenantContext.tenantId,
        eventCount: events.length,
        fromVersion
      });
      
      return events;
    } catch (error) {
      // Track errors
      await this.metricsCollector.increment('event.replay.error', 1);
      throw error;
    }
  }
  
  /**
   * Get events before a specific timestamp
   * @param documentId Document identifier
   * @param timestamp Timestamp threshold
   * @returns Events that occurred before or at the timestamp
   */
  async getEventsBeforeTime(documentId: string, timestamp: number): Promise<Event[]> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    try {
      const events = await this.prisma.event.findMany({
        where: {
          documentId,
          tenantId: tenantContext.tenantId,
          timestamp: {
            lte: timestamp
          }
        },
        orderBy: {
          version: 'asc'
        }
      });
      
      // Track metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('event.getBeforeTime', duration);
      
      return events;
    } catch (error) {
      await this.metricsCollector.increment('event.getBeforeTime.error', 1);
      throw error;
    }
  }
  
  /**
   * Get events for a specific version range
   * @param query Query parameters
   * @returns Events matching the query
   */
  async queryEvents(query: EventQuery): Promise<Event[]> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    try {
      const where: any = {
        documentId: query.documentId,
        tenantId: tenantContext.tenantId
      };
      
      // Add version constraints if provided
      if (query.fromVersion !== undefined) {
        where.version = { ...where.version, gte: query.fromVersion };
      }
      
      if (query.toVersion !== undefined) {
        where.version = { ...where.version, lte: query.toVersion };
      }
      
      // Add timestamp constraints if provided
      if (query.fromTimestamp !== undefined) {
        where.timestamp = { ...where.timestamp, gte: query.fromTimestamp };
      }
      
      if (query.toTimestamp !== undefined) {
        where.timestamp = { ...where.timestamp, lte: query.toTimestamp };
      }
      
      const events = await this.prisma.event.findMany({
        where,
        orderBy: {
          version: 'asc'
        },
        take: query.limit
      });
      
      // Track metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('event.query', duration);
      
      return events;
    } catch (error) {
      await this.metricsCollector.increment('event.query.error', 1);
      throw error;
    }
  }
  
  /**
   * Get event count for a document
   * @param documentId Document identifier
   * @returns Number of events
   */
  async getEventCount(documentId: string): Promise<number> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    return this.prisma.event.count({
      where: {
        documentId,
        tenantId: tenantContext.tenantId
      }
    });
  }
  
  /**
   * Clear the event cache for a document
   * @param documentId Document identifier
   */
  clearCache(documentId: string): void {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return;
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    this.eventCache.delete(key);
  }
  
  /**
   * Update the event cache with a new event
   * @param documentId Document identifier
   * @param event New event
   * @private
   */
  private updateEventCache(documentId: string, event: Event): void {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return;
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    let events = this.eventCache.get(key) || [];
    
    // Add the new event
    events = [...events, event].sort((a, b) => 
      (a.version || 0) - (b.version || 0)
    );
    
    // Limit cache size
    if (events.length > this.maxCacheSize) {
      events = events.slice(events.length - this.maxCacheSize);
    }
    
    this.eventCache.set(key, events);
    this.manageCacheSize();
  }
  
  /**
   * Cache events for a document
   * @param documentId Document identifier
   * @param events Events to cache
   * @private
   */
  private cacheEvents(documentId: string, events: Event[]): void {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return;
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    this.eventCache.set(key, [...events]);
    this.manageCacheSize();
  }
  
  /**
   * Get events from cache, filtering by version
   * @param documentId Document identifier
   * @param fromVersion Starting version
   * @returns Cached events or null if not in cache
   * @private
   */
  private getEventsFromCache(documentId: string, fromVersion: number): Event[] | null {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) return null;
    
    const key = `${tenantContext.tenantId}:${documentId}`;
    const events = this.eventCache.get(key);
    
    if (!events) return null;
    
    return events.filter(e => (e.version || 0) >= fromVersion);
  }
  
  /**
   * Ensure cache doesn't grow too large
   * @private
   */
  private manageCacheSize(): void {
    // If cache has too many keys, remove least recently used ones
    if (this.eventCache.size > this.maxCacheSize) {
      // Identify oldest entries
      const keys = Array.from(this.eventCache.keys());
      const keysToRemove = keys.slice(0, keys.length - this.maxCacheSize);
      
      // Remove them
      for (const key of keysToRemove) {
        this.eventCache.delete(key);
      }
    }
  }
}