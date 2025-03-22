import { getTenantContext } from '../lib/tenantContext';
import { ComplianceLogger } from '../compliance/logger';
import { EventStore, BaseEvent, SchemaVersion } from '../events/EventStore';
import { TransactionManager } from '../transactions/TransactionManager';
import { MetricsCollector } from '../metrics/metrics-collector';
import { createHash } from 'crypto';

/**
 * Command execution result containing the generated event and metadata
 */
export interface CommandResult<TEvent = any> {
  /** Event object generated from command execution */
  event: TEvent;
  /** Metadata about the command execution */
  metadata: {
    /** Time taken to execute the command in milliseconds */
    executionTimeMs: number;
    /** Whether the command was validated before execution */
    validated: boolean;
    /** Transaction ID for this command */
    transactionId: string;
  };
}

/**
 * Command handler function signature
 * @template TCommand Command type
 * @template TEvent Event type produced by the command
 */
export type CommandHandler<TCommand = any, TEvent = any> = (
  command: TCommand
) => Promise<CommandResult<TEvent>>;

/**
 * Command validator function signature
 * @template TCommand Command type
 */
export type CommandValidator<TCommand = any> = (
  command: TCommand
) => Promise<{ valid: boolean; reason?: string }>;

/**
 * Registered command configuration
 */
interface RegisteredCommand<TCommand = any, TEvent = any> {
  /** Command type identifier */
  type: string;
  /** Handler function for the command */
  handler: CommandHandler<TCommand, TEvent>;
  /** Optional validator function */
  validator?: CommandValidator<TCommand>;
  /** Whether to log command execution for compliance */
  logToCompliance: boolean;
  /** Schema version for events produced by this command */
  schemaVersion: SchemaVersion;
}

/**
 * Configuration for the command registry
 */
export interface CommandRegistryConfig {
  /** Event store for persisting events */
  eventStore: EventStore;
  /** Transaction manager for managing command boundaries */
  transactionManager: TransactionManager;
  /** Metrics collector for tracking command execution */
  metricsCollector: MetricsCollector;
  /** Whether to enable detailed command tracing */
  enableTracing?: boolean;
}

/**
 * Central registry for document editing commands
 * Manages command registration, validation and execution
 */
export class CommandRegistry {
  private commands = new Map<string, RegisteredCommand>();
  private eventStore: EventStore;
  private transactionManager: TransactionManager;
  private metricsCollector: MetricsCollector;
  private enableTracing: boolean;
  
  /**
   * Create a new command registry
   * @param config Configuration for the command registry
   */
  constructor(config: CommandRegistryConfig) {
    this.eventStore = config.eventStore;
    this.transactionManager = config.transactionManager;
    this.metricsCollector = config.metricsCollector;
    this.enableTracing = config.enableTracing ?? false;
  }
  
  /**
   * Register a new command handler
   * @param type Command type identifier
   * @param handler Function that executes the command
   * @param options Additional command configuration
   */
  register<TCommand = any, TEvent = any>(
    type: string,
    handler: CommandHandler<TCommand, TEvent>,
    options: {
      validator?: CommandValidator<TCommand>;
      logToCompliance?: boolean;
      schemaVersion?: SchemaVersion;
    } = {}
  ): void {
    if (this.commands.has(type)) {
      throw new Error(`Command type "${type}" is already registered`);
    }
    
    // Create a default schema version if none provided
    const defaultSchemaVersion: SchemaVersion = {
      version: '1.0',
      schemaHash: createHash('sha256').update(type).digest('hex')
    };
    
    this.commands.set(type, {
      type,
      handler,
      validator: options.validator,
      logToCompliance: options.logToCompliance ?? true,
      schemaVersion: options.schemaVersion ?? defaultSchemaVersion
    });
    
    // Log command registration
    if (this.enableTracing) {
      console.log(`Registered command handler for "${type}"`);
    }
  }
  
  /**
   * Unregister a command handler
   * @param type Command type identifier
   * @returns Boolean indicating if the command was successfully unregistered
   */
  unregister(type: string): boolean {
    const result = this.commands.delete(type);
    
    if (result && this.enableTracing) {
      console.log(`Unregistered command handler for "${type}"`);
    }
    
    return result;
  }
  
  /**
   * Execute a command with validation
   * @param type Command type identifier
   * @param command Command payload
   * @param options Execution options
   * @returns Command execution result
   */
  async execute<TCommand = any, TEvent extends BaseEvent = any>(
    type: string,
    command: TCommand,
    options: { 
      skipValidation?: boolean;
      transactionId?: string;
    } = {}
  ): Promise<CommandResult<TEvent>> {
    const tenantContext = getTenantContext();
    
    if (!tenantContext?.tenantId) {
      throw new Error('Cannot execute command: No tenant context available');
    }
    
    // Get command handler
    const registeredCommand = this.commands.get(type);
    if (!registeredCommand) {
      throw new Error(`No handler registered for command type "${type}"`);
    }
    
    // Get or create transaction
    let transactionId = options.transactionId;
    let localTransaction = false;
    
    if (!transactionId) {
      const transaction = await this.transactionManager.beginTransaction(`command.${type}`);
      transactionId = transaction.id;
      localTransaction = true;
    }
    
    try {
      // Validate the command if a validator is provided
      let validated = false;
      if (registeredCommand.validator && !options.skipValidation) {
        const validationResult = await registeredCommand.validator(command);
        
        if (!validationResult.valid) {
          await this.transactionManager.abortTransaction(transactionId, 
            `Command validation failed: ${validationResult.reason || 'Unknown reason'}`);
          throw new Error(`Command validation failed: ${validationResult.reason || 'Unknown reason'}`);
        }
        
        validated = true;
      }
      
      // Record metrics before execution
      await this.metricsCollector.incrementCounter(`command.${type}.executed`, {
        tenantId: tenantContext.tenantId
      });
      
      // Execute the command and measure execution time
      const startTime = Date.now();
      const result = await registeredCommand.handler(command);
      const executionTimeMs = Date.now() - startTime;
      
      // Record execution time
      await this.metricsCollector.recordValue(`command.${type}.executionTime`, executionTimeMs, {
        tenantId: tenantContext.tenantId
      });
      
      // Enhance the event with required metadata
      const enhancedEvent = this.enhanceEvent(result.event, {
        type: type,
        tenantId: tenantContext.tenantId,
        userId: tenantContext.userId || 'system',
        transactionId,
        schemaVersion: registeredCommand.schemaVersion
      });
      
      // Store the event
      await this.eventStore.appendEvent(enhancedEvent);
      
      // Enhance result with metadata
      const enhancedResult: CommandResult<TEvent> = {
        event: enhancedEvent,
        metadata: {
          executionTimeMs,
          validated,
          transactionId,
        }
      };
      
      // Log to compliance if configured
      if (registeredCommand.logToCompliance) {
        await ComplianceLogger.log({
          eventType: `command.executed.${type}`,
          resourceId: (command as any).documentId || (enhancedEvent as any).aggregateId || 'unknown',
          description: `Command ${type} executed successfully`,
          metadata: {
            commandType: type,
            executionTimeMs,
            transactionId,
            userId: tenantContext.userId
          }
        });
      }
      
      // Commit the transaction if we started it
      if (localTransaction) {
        await this.transactionManager.commitTransaction(transactionId);
      }
      
      return enhancedResult;
    } catch (error) {
      // Abort transaction if we started it and an error occurred
      if (localTransaction) {
        await this.transactionManager.abortTransaction(
          transactionId, 
          `Command execution failed: ${(error as Error).message}`
        );
      }
      
      // Record error metrics
      await this.metricsCollector.incrementCounter(`command.${type}.error`, {
        tenantId: tenantContext.tenantId
      });
      
      // Rethrow the error
      throw error;
    }
  }
  
  /**
   * Get all registered command types
   * @returns Array of command type identifiers
   */
  getRegisteredCommands(): string[] {
    return Array.from(this.commands.keys());
  }
  
  /**
   * Execute multiple commands as a batch within a single transaction
   * @param commands Array of command objects with type and payload
   * @returns Array of command execution results
   */
  async executeBatch<TEvent extends BaseEvent = any>(
    commands: Array<{ type: string; command: any }>
  ): Promise<CommandResult<TEvent>[]> {
    if (commands.length === 0) {
      return [];
    }
    
    // Start a transaction for the entire batch
    const transaction = await this.transactionManager.beginTransaction('command.batch');
    const transactionId = transaction.id;
    
    try {
      const results: CommandResult<TEvent>[] = [];
      
      // Execute each command in the batch
      for (const { type, command } of commands) {
        const result = await this.execute<any, TEvent>(type, command, { 
          transactionId 
        });
        results.push(result);
      }
      
      // Commit the transaction
      await this.transactionManager.commitTransaction(transactionId);
      
      return results;
    } catch (error) {
      // Abort the transaction if any command fails
      await this.transactionManager.abortTransaction(
        transactionId,
        `Batch execution failed: ${(error as Error).message}`
      );
      
      throw error;
    }
  }
  
  /**
   * Enhance an event with required metadata
   * @param event Original event
   * @param metadata Additional metadata to add
   * @private
   */
  private enhanceEvent<T extends Partial<BaseEvent>>(event: T, metadata: {
    type: string;
    tenantId: string;
    userId: string;
    transactionId: string;
    schemaVersion: SchemaVersion;
  }): T & BaseEvent {
    const timestamp = new Date().toISOString();
    const aggregateId = (event as any).aggregateId || (event as any).documentId;
    
    if (!aggregateId) {
      throw new Error('Event must have an aggregateId or documentId property');
    }
    
    // Generate vector clock for this event
    const vectorClock: Record<string, number> = {
      ...((event as any).vectorClock || {}),
      [metadata.userId]: Date.now()
    };
    
    return {
      ...event,
      id: (event as any).id || `evt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      type: metadata.type,
      aggregateId,
      aggregateVersion: (event as any).aggregateVersion || 1,
      timestamp,
      schemaVersion: metadata.schemaVersion,
      userId: metadata.userId,
      tenantId: metadata.tenantId,
      transactionId: metadata.transactionId,
      vectorClock
    } as T & BaseEvent;
  }
}

/**
 * Base interface for document commands
 */
export interface DocumentCommand {
  /** Document identifier */
  documentId: string;
  /** User identifier who initiated the command */
  userId: string;
}

/**
 * Command for inserting text at a specific position
 */
export interface InsertTextCommand extends DocumentCommand {
  /** Position at which to insert text */
  position: number;
  /** Text content to insert */
  text: string;
}

/**
 * Command for deleting text from a document
 */
export interface DeleteTextCommand extends DocumentCommand {
  /** Starting position for deletion */
  position: number;
  /** Number of characters to delete */
  length: number;
}

/**
 * Command for formatting text in a document
 */
export interface FormatTextCommand extends DocumentCommand {
  /** Starting position for formatting */
  position: number;
  /** Number of characters to format */
  length: number;
  /** Formatting attributes to apply */
  attributes: Record<string, any>;
}

/**
 * Event emitted when text is inserted
 */
export interface TextInsertedEvent extends Partial<BaseEvent> {
  /** Document identifier */
  documentId: string;
  /** Position at which text was inserted */
  position: number;
  /** Text content that was inserted */
  text: string;
  /** Aggregate version after this event */
  aggregateVersion: number;
}

/**
 * Event emitted when text is deleted
 */
export interface TextDeletedEvent extends Partial<BaseEvent> {
  /** Document identifier */
  documentId: string;
  /** Position from which text was deleted */
  position: number;
  /** Text content that was deleted */
  text: string;
  /** Aggregate version after this event */
  aggregateVersion: number;
}

/**
 * Event emitted when text is formatted
 */
export interface TextFormattedEvent extends Partial<BaseEvent> {
  /** Document identifier */
  documentId: string;
  /** Position at which formatting was applied */
  position: number;
  /** Length of text that was formatted */
  length: number;
  /** Formatting attributes that were applied */
  attributes: Record<string, any>;
  /** Aggregate version after this event */
  aggregateVersion: number;
}

// Example command registration for INSERT_TEXT
export function registerTextCommands(registry: CommandRegistry): void {
  // Register INSERT_TEXT command
  registry.register<InsertTextCommand, TextInsertedEvent>(
    'INSERT_TEXT',
    async (command) => {
      // The command handler for inserting text
      return {
        event: {
          documentId: command.documentId,
          position: command.position,
          text: command.text,
          // This would typically be fetched from a version tracker
          aggregateVersion: 1
        },
        metadata: {
          executionTimeMs: 0,  // Will be filled by registry
          validated: false,    // Will be filled by registry
          transactionId: ''    // Will be filled by registry
        }
      };
    },
    {
      // Validator for INSERT_TEXT command
      validator: async (command) => {
        if (!command.documentId) {
          return { valid: false, reason: 'Document ID is required' };
        }
        if (typeof command.position !== 'number' || command.position < 0) {
          return { valid: false, reason: 'Position must be a non-negative number' };
        }
        if (!command.text) {
          return { valid: false, reason: 'Text is required' };
        }
        if (!command.userId) {
          return { valid: false, reason: 'User ID is required' };
        }
        return { valid: true };
      },
      // Schema version for events produced by this command
      schemaVersion: {
        version: '1.0',
        schemaHash: createHash('sha256').update('TextInsertedEvent-1.0').digest('hex')
      }
    }
  );

  // Register DELETE_TEXT command
  registry.register<DeleteTextCommand, TextDeletedEvent>(
    'DELETE_TEXT',
    async (command) => {
      // Handler implementation would retrieve the text being deleted
      // from the current document state
      const deletedText = "placeholder"; // This would come from actual document state
      
      return {
        event: {
          documentId: command.documentId,
          position: command.position,
          text: deletedText,
          aggregateVersion: 1
        },
        metadata: {
          executionTimeMs: 0,
          validated: false,
          transactionId: ''
        }
      };
    },
    {
      validator: async (command) => {
        if (!command.documentId) {
          return { valid: false, reason: 'Document ID is required' };
        }
        if (typeof command.position !== 'number' || command.position < 0) {
          return { valid: false, reason: 'Position must be a non-negative number' };
        }
        if (typeof command.length !== 'number' || command.length <= 0) {
          return { valid: false, reason: 'Length must be a positive number' };
        }
        if (!command.userId) {
          return { valid: false, reason: 'User ID is required' };
        }
        return { valid: true };
      },
      schemaVersion: {
        version: '1.0',
        schemaHash: createHash('sha256').update('TextDeletedEvent-1.0').digest('hex')
      }
    }
  );

  // Register FORMAT_TEXT command
  registry.register<FormatTextCommand, TextFormattedEvent>(
    'FORMAT_TEXT',
    async (command) => {
      return {
        event: {
          documentId: command.documentId,
          position: command.position,
          length: command.length,
          attributes: command.attributes,
          aggregateVersion: 1
        },
        metadata: {
          executionTimeMs: 0,
          validated: false,
          transactionId: ''
        }
      };
    },
    {
      validator: async (command) => {
        if (!command.documentId) {
          return { valid: false, reason: 'Document ID is required' };
        }
        if (typeof command.position !== 'number' || command.position < 0) {
          return { valid: false, reason: 'Position must be a non-negative number' };
        }
        if (typeof command.length !== 'number' || command.length <= 0) {
          return { valid: false, reason: 'Length must be a positive number' };
        }
        if (!command.attributes || Object.keys(command.attributes).length === 0) {
          return { valid: false, reason: 'At least one formatting attribute is required' };
        }
        if (!command.userId) {
          return { valid: false, reason: 'User ID is required' };
        }
        return { valid: true };
      },
      schemaVersion: {
        version: '1.0',
        schemaHash: createHash('sha256').update('TextFormattedEvent-1.0').digest('hex')
      }
    }
  );
}