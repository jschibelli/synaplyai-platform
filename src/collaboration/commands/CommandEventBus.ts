import { metricsCollector } from '../../metrics/metrics-collector';

/**
 * Interface for command events
 */
export interface CommandEvent {
  type: string;
  documentId: string;
  userId: string;
  data?: Record<string, any>;
  metadata?: Record<string, any>;
}

/**
 * Handler for command events
 */
type CommandEventHandler = (event: CommandEvent) => void;

/**
 * Command event bus for command events
 */
class CommandEventBus {
  private handlers: Map<string, CommandEventHandler[]> = new Map();
  
  /**
   * Register a handler for a command event
   * @param eventType Type of event to handle
   * @param handler Handler function
   */
  on(eventType: string, handler: CommandEventHandler): void {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, []);
    }
    
    this.handlers.get(eventType)?.push(handler);
  }
  
  /**
   * Remove a handler for a command event
   * @param eventType Type of event
   * @param handler Handler to remove
   */
  off(eventType: string, handler: CommandEventHandler): void {
    if (!this.handlers.has(eventType)) return;
    
    const handlers = this.handlers.get(eventType);
    if (!handlers) return;
    
    const index = handlers.indexOf(handler);
    if (index !== -1) {
      handlers.splice(index, 1);
    }
  }
  
  /**
   * Trigger a command event
   * @param event Command event to trigger
   */
  trigger(event: CommandEvent): void {
    const startTime = performance.now();
    
    const handlers = this.handlers.get(event.type) || [];
    
    handlers.forEach(handler => {
      try {
        handler(event);
      } catch (error) {
        console.error(`Error handling event ${event.type}:`, error);
      }
    });
    
    // Record metrics
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('command.event.duration', duration, {
      eventType: event.type,
      handlerCount: handlers.length.toString()
    });
  }
}

// Create singleton instance
export const commandEventBus = new CommandEventBus();

/**
 * Trigger a command event
 * @param event Command event to trigger
 */
export function triggerCommandEvent(event: CommandEvent): void {
  commandEventBus.trigger(event);
}