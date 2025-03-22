import { EventEmitter } from 'events';
import { Event } from './EventStore';
import { getTenantContext } from '../../lib/tenant-context';
import { MetricsCollector } from '../../metrics/metrics-collector';

export interface Subscription {
  unsubscribe(): void;
}

export interface EventFilter {
  documentId?: string;
  tenantId?: string;
  eventTypes?: string[];
}

/**
 * EventBus provides real-time event propagation for collaborative editing.
 * It maintains tenant isolation and provides filtering capabilities.
 */
export class EventBus {
  private emitter = new EventEmitter();
  private metricsCollector: MetricsCollector;
  
  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector;
    
    // Increase max listeners to support many concurrent clients
    this.emitter.setMaxListeners(100);
  }
  
  /**
   * Publish an event to all subscribers
   * @param event The event to publish
   */
  async publish(event: Event): Promise<void> {
    const startTime = performance.now();
    
    try {
      // Always ensure events have tenantId for isolation
      if (!event.tenantId) {
        const tenantContext = getTenantContext();
        if (tenantContext?.tenantId) {
          event.tenantId = tenantContext.tenantId;
        } else {
          console.warn('Publishing event without tenant context');
        }
      }
      
      // Emit to specific tenant+document channel for isolation
      const documentChannel = `${event.tenantId}:${event.documentId}`;
      const tenantChannel = `${event.tenantId}:*`;
      
      // Emit to specific type channels
      this.emitter.emit(`${documentChannel}:${event.type}`, event);
      this.emitter.emit(`${tenantChannel}:${event.type}`, event);
      
      // Emit to all events channels
      this.emitter.emit(documentChannel, event);
      this.emitter.emit(tenantChannel, event);
      
      // Track event publishing metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('eventbus.publish', duration);
      await this.metricsCollector.track('eventbus.published', 1, {
        eventType: event.type,
        documentId: event.documentId,
        tenantId: event.tenantId
      });
    } catch (error) {
      console.error('Error publishing event:', error);
      await this.metricsCollector.increment('eventbus.publish.error', 1);
    }
  }
  
  /**
   * Subscribe to events with optional filtering
   * @param callback Function to call when events are received
   * @param filter Optional filter to receive only specific events
   * @returns Subscription object with unsubscribe method
   */
  subscribe(callback: (event: Event) => void, filter: EventFilter = {}): Subscription {
    // Validate tenant isolation
    const tenantContext = getTenantContext();
    const subscriberTenantId = filter.tenantId || tenantContext?.tenantId;
    
    if (!subscriberTenantId) {
      throw new Error('Cannot subscribe without tenant context');
    }
    
    // Create channel based on filter
    let channel: string;
    
    if (filter.documentId) {
      // Document-specific channel
      channel = `${subscriberTenantId}:${filter.documentId}`;
      
      // Event type specific if provided
      if (filter.eventTypes && filter.eventTypes.length === 1) {
        channel = `${channel}:${filter.eventTypes[0]}`;
      }
    } else {
      // Tenant-wide channel
      channel = `${subscriberTenantId}:*`;
      
      // Event type specific if provided
      if (filter.eventTypes && filter.eventTypes.length === 1) {
        channel = `${channel}:${filter.eventTypes[0]}`;
      }
    }
    
    // Create wrapped callback with tenant filtering for added security
    const wrappedCallback = (event: Event) => {
      // Double-check tenant isolation
      if (event.tenantId !== subscriberTenantId) {
        console.error(`Tenant isolation breach attempt: ${event.tenantId} vs ${subscriberTenantId}`);
        return;
      }
      
      // Filter by event types if multiple types provided
      if (filter.eventTypes && filter.eventTypes.length > 1) {
        if (!filter.eventTypes.includes(event.type)) {
          return;
        }
      }
      
      // Pass event to subscriber
      callback(event);
    };
    
    // Subscribe to the channel
    this.emitter.on(channel, wrappedCallback);
    
    // Track subscription metrics
    this.metricsCollector.increment('eventbus.subscribers', 1).catch(console.error);
    
    // Return subscription object for unsubscribing
    return {
      unsubscribe: () => {
        this.emitter.off(channel, wrappedCallback);
        this.metricsCollector.increment('eventbus.subscribers', -1).catch(console.error);
      }
    };
  }
  
  /**
   * Get the current number of subscribers
   */
  getSubscriberCount(): number {
    return this.emitter.eventNames().length;
  }
}