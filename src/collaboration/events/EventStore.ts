import { PrismaClient } from '@prisma/client';
import { MetricsCollector } from '../../services/metrics/MetricsCollector';

export interface DocumentEvent {
  id: string;
  documentId: string;
  version: number;
  tenantId: string;
  userId: string;
  type: string;
  data: any;
  timestamp: number;
  metadata?: Record<string, any>;
}

export interface EventStoreOptions {
  tenantId?: string;
  transactionId?: string;
}

/**
 * Store for managing document events with tenant isolation
 */
export class EventStore {
  private eventCache: Map<string, DocumentEvent[]> = new Map();
  
  constructor(
    private prisma: PrismaClient,
    private metricsCollector?: MetricsCollector
  ) {}

  /**
   * Append a new event to the event store
   */
  async appendEvent(event: DocumentEvent, options?: EventStoreOptions): Promise<DocumentEvent> {
    const startTime = performance.now();
    
    try {
      // Ensure we have a tenant ID either from options or the event
      const tenantId = options?.tenantId || event.tenantId;
      if (!tenantId) {
        throw new Error('Tenant ID is required to append events');
      }
      
      // Check if a similar event already exists (prevent duplicates)
      const existingEvent = await this.prisma.event.findFirst({
        where: {
          documentId: event.documentId,
          tenantId,
          version: event.version,
        }
      });
      
      if (existingEvent) {
        throw new Error(`Event with version ${event.version} already exists for document ${event.documentId}`);
      }
      
      // Create the event
      const createdEvent = await this.prisma.event.create({
        data: {
          id: event.id,
          documentId: event.documentId,
          tenantId,
          userId: event.userId,
          type: event.type,
          data: event.data,
          version: event.version,
          timestamp: event.timestamp,
          metadata: event.metadata || {},
          transactionId: options?.transactionId || null
        }
      });
      
      // Invalidate cache for this document
      this.clearCache(event.documentId, tenantId);
      
      // Track metrics
      if (this.metricsCollector) {
        const duration = performance.now() - startTime;
        await this.metricsCollector.recordValue('event.append.duration', duration, {
          tenantId,
          eventType: event.type
        });
      }
      
      return createdEvent as unknown as DocumentEvent;
    } catch (error) {
      // Track error metrics
      if (this.metricsCollector) {
        await this.metricsCollector.track('event.append.error', {
          tenantId: options?.tenantId || event.tenantId,
          error: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Get events for a document starting from a specific version
   */
  async getEvents(documentId: string, fromVersion: number = 0, tenantId?: string): Promise<DocumentEvent[]> {
    const startTime = performance.now();
    
    try {
      // Query events from database
      const events = await this.prisma.event.findMany({
        where: {
          documentId,
          version: { gte: fromVersion },
          ...(tenantId ? { tenantId } : {})
        },
        orderBy: {
          version: 'asc'
        }
      });
      
      // Track metrics
      if (this.metricsCollector) {
        const duration = performance.now() - startTime;
        await this.metricsCollector.recordValue('event.query.duration', duration, {
          tenantId: tenantId || 'unknown',
          eventCount: events.length
        });
      }
      
      return events as unknown as DocumentEvent[];
    } catch (error) {
      // Track error metrics
      if (this.metricsCollector) {
        await this.metricsCollector.track('event.query.error', {
          tenantId: tenantId || 'unknown',
          error: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Count events for a document since a specific version
   * This is needed for the tests to pass
   */
  async getEventCountSinceVersion(documentId: string, fromVersion: number, tenantId?: string): Promise<number> {
    const startTime = performance.now();
    
    try {
      // Count events matching criteria
      const count = await this.prisma.event.count({
        where: {
          documentId,
          version: { gt: fromVersion },
          ...(tenantId ? { tenantId } : {})
        }
      });
      
      // Track metrics
      if (this.metricsCollector) {
        const duration = performance.now() - startTime;
        await this.metricsCollector.recordValue('event.count.duration', duration, {
          tenantId: tenantId || 'unknown'
        });
      }
      
      return count;
    } catch (error) {
      // Track error metrics
      if (this.metricsCollector) {
        await this.metricsCollector.track('event.count.error', {
          tenantId: tenantId || 'unknown',
          error: error.message
        });
      }
      
      throw error;
    }
  }

  /**
   * Get events before a specific timestamp
   */
  async getEventsBeforeTime(documentId: string, timestamp: number, tenantId?: string): Promise<DocumentEvent[]> {
    return this.prisma.event.findMany({
      where: {
        documentId,
        timestamp: { lt: timestamp },
        ...(tenantId ? { tenantId } : {})
      },
      orderBy: {
        version: 'asc'
      }
    }) as unknown as Promise<DocumentEvent[]>;
  }

  /**
   * Query events using a custom filter
   */
  async queryEvents(filter: any): Promise<DocumentEvent[]> {
    return this.prisma.event.findMany({
      where: filter,
      orderBy: {
        version: 'asc'
      }
    }) as unknown as Promise<DocumentEvent[]>;
  }

  /**
   * Count events using a custom filter
   */
  async getEventCount(filter: any): Promise<number> {
    return this.prisma.event.count({
      where: filter
    });
  }

  /**
   * Replay events for a document to reconstruct state
   */
  async replayEvents<T>(documentId: string, handler: (state: T, event: DocumentEvent) => T, initialState: T, tenantId?: string): Promise<T> {
    const events = await this.getEvents(documentId, 0, tenantId);
    
    return events.reduce((state, event) => {
      try {
        return handler(state, event);
      } catch (error) {
        // If event handling fails, report but continue with unchanged state
        console.error(`Error replaying event ${event.id}:`, error);
        return state;
      }
    }, initialState);
  }

  /**
   * Clear event cache for a document
   */
  clearCache(documentId: string, tenantId?: string): void {
    const cacheKey = tenantId ? `${tenantId}:${documentId}` : documentId;
    this.eventCache.delete(cacheKey);
  }
}