import { Command } from '../commands/CommandRegistry';
import { EventStore } from '../events/EventStore';
import { TransactionManager, HybridLogicalClock } from '../transactions/TransactionManager';
import { VectorClock } from '../conflict/VectorClock';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenantContext';
import { v4 as uuidv4 } from 'uuid';

interface CommandContext {
  transactionId?: string;
  parentCommandId?: string;
  metadata?: Record<string, any>;
}

/**
 * Integrates command execution with event storage and transaction boundaries
 */
export class CommandEventIntegrator {
  constructor(
    private eventStore: EventStore,
    private transactionManager: TransactionManager,
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Execute a command with proper transaction boundaries and event generation
   * @param command Command to execute
   * @param handler Function that executes the command and returns result
   * @param context Optional command context for transaction handling
   * @returns Result of the command execution
   */
  async executeCommand<TResult>(
    command: Command, 
    handler: (cmd: Command, txId: string) => Promise<{ result: TResult; events: any[] }>,
    context: CommandContext = {}
  ): Promise<TResult> {
    const startTime = performance.now();
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    // Generate or use provided transaction ID
    const transactionId = context.transactionId || `tx-${uuidv4()}`;
    
    // Generate command ID if not provided
    if (!command.id) {
      command.id = `cmd-${uuidv4()}`;
    }
    
    // Add tenant and user info to command
    command.tenantId = tenantContext.tenantId;
    command.userId = tenantContext.userId || 'unknown';
    
    try {
      // Execute in transaction
      return await this.transactionManager.executeInTransaction(async (transaction) => {
        // Execute the command handler to get result and generated events
        const { result, events } = await handler(command, transactionId);
        
        // Get timestamp for events
        const timestamp = this.transactionManager.getCurrentTimestamp();
        
        // Store all generated events
        for (const event of events) {
          // Add standard metadata to each event
          const enrichedEvent = {
            ...event,
            metadata: {
              ...event.metadata,
              transactionId,
              commandId: command.id,
              timestamp: timestamp.wallTime,
              vectorClock: this.createVectorClock(command, timestamp),
              schemaVersion: event.schemaVersion || '1.0'
            }
          };
          
          await this.eventStore.store(enrichedEvent, { client: transaction.client });
        }
        
        // Record metrics
        const duration = performance.now() - startTime;
        await this.metricsCollector.recordLatency(`command.${command.type}.execution`, duration);
        await this.metricsCollector.increment(`command.${command.type}.count`, 1);
        
        return result;
      });
    } catch (error) {
      // Track error
      await this.metricsCollector.increment(`command.${command.type}.error`, 1);
      
      // Re-throw the error
      throw error;
    }
  }
  
  /**
   * Execute multiple commands in a single transaction
   * @param commands Commands to execute
   * @param handlers Command handlers for each command
   * @returns Results of command executions
   */
  async executeCommands<TResult>(
    commands: Command[], 
    handlers: Array<(cmd: Command, txId: string) => Promise<{ result: TResult; events: any[] }>>,
    context: CommandContext = {}
  ): Promise<TResult[]> {
    if (commands.length !== handlers.length) {
      throw new Error('Number of commands must match number of handlers');
    }
    
    const transactionId = context.transactionId || `tx-${uuidv4()}`;
    
    return this.transactionManager.executeInTransaction(async (transaction) => {
      const results: TResult[] = [];
      const timestamp = this.transactionManager.getCurrentTimestamp();
      
      for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const handler = handlers[i];
        
        // Generate command ID if not provided
        if (!command.id) {
          command.id = `cmd-${uuidv4()}-${i}`;
        }
        
        // Add tenant context
        const tenantContext = getTenantContext();
        if (tenantContext) {
          command.tenantId = tenantContext.tenantId;
          command.userId = tenantContext.userId || 'unknown';
        }
        
        // Execute command
        const { result, events } = await handler(command, transactionId);
        
        // Store events
        for (const event of events) {
          const enrichedEvent = {
            ...event,
            metadata: {
              ...event.metadata,
              transactionId,
              commandId: command.id,
              timestamp: timestamp.wallTime,
              vectorClock: this.createVectorClock(command, timestamp),
              schemaVersion: event.schemaVersion || '1.0'
            }
          };
          
          await this.eventStore.store(enrichedEvent, { client: transaction.client });
        }
        
        results.push(result);
      }
      
      return results;
    });
  }
  
  /**
   * Create vector clock for event metadata
   * @private
   */
  private createVectorClock(command: Command, timestamp: HybridLogicalClock): Record<string, number> {
    // Create a vector clock entry
    const clientId = command.userId || 'system';
    const nodeId = timestamp.nodeId;
    
    // Combine physical and logical components for timestamp value
    const timeValue = timestamp.wallTime * 1000 + timestamp.logical;
    
    return { 
      [clientId]: timeValue,
      [nodeId]: timeValue 
    };
  }
}