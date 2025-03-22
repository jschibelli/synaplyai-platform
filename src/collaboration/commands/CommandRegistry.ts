import { Command, CommandResult, ValidationResult } from './types';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenantContext';
import { EventStore } from '../events/EventStore';
import { TransactionManager } from '../transactions/TransactionManager';
import { ComplianceLogger } from '../../compliance/logger';

/**
 * Handler function for a command
 */
export type CommandHandler<TCommand extends Command, TResult extends CommandResult> = 
  (command: TCommand, tenantId?: string) => Promise<TResult>;

/**
 * Validation function for a command
 */
export type ValidationRule<TCommand extends Command> = 
  (command: TCommand) => Promise<ValidationResult>;

/**
 * Registry for command handlers with validation, metrics, and tenant isolation
 */
export class CommandRegistry {
  private handlers: Map<string, CommandHandler<any, any>> = new Map();
  private validationRules: Map<string, Array<ValidationRule<any>>> = new Map();
  private schemaVersions: Map<string, { version: string; schemaHash: string }> = new Map();
  
  /**
   * Creates a new command registry
   * @param eventStore Event store for command events
   * @param transactionManager Transaction manager for command execution
   * @param metricsCollector Metrics collector for performance tracking
   */
  constructor(
    private eventStore: EventStore,
    private transactionManager: TransactionManager,
    private metricsCollector: MetricsCollector
  ) {}
  
  /**
   * Register a command handler for a specific command type
   * @param commandType Command type identifier
   * @param handler Command handler function
   * @param options Optional registration options
   */
  register<TCommand extends Command, TResult extends CommandResult>(
    commandType: string,
    handler: CommandHandler<TCommand, TResult>,
    options?: {
      validator?: ValidationRule<TCommand>,
      schemaVersion?: { version: string; schemaHash: string }
    }
  ): void {
    // Check if already registered
    if (this.handlers.has(commandType)) {
      throw new Error(`Handler for command type '${commandType}' is already registered`);
    }
    
    // Register handler
    this.handlers.set(commandType, handler);
    this.validationRules.set(commandType, []);
    
    // Add validator if provided
    if (options?.validator) {
      this.addValidationRule(commandType, options.validator);
    }
    
    // Record schema version if provided
    if (options?.schemaVersion) {
      this.schemaVersions.set(commandType, options.schemaVersion);
    }
    
    // Log registration for compliance
    ComplianceLogger.log({
      eventType: 'command.handler.registered',
      resourceId: commandType,
      description: `Command handler registered for ${commandType}`,
      metadata: {
        schemaVersion: options?.schemaVersion?.version || 'unknown'
      }
    }).catch(err => {
      console.error(`Failed to log command handler registration: ${err.message}`);
    });
  }
  
  /**
   * Add a validation rule for a specific command type
   * @param commandType Command type identifier
   * @param validationRule Validation function
   */
  addValidationRule<TCommand extends Command>(
    commandType: string, 
    validationRule: ValidationRule<TCommand>
  ): void {
    // Check if command type exists
    if (!this.handlers.has(commandType)) {
      throw new Error(`No handler registered for command type '${commandType}'`);
    }
    
    // Add validation rule
    const rules = this.validationRules.get(commandType) || [];
    rules.push(validationRule as ValidationRule<any>);
    this.validationRules.set(commandType, rules);
  }
  
  /**
   * Execute a command using the registered handler
   * @param command Command to execute
   * @returns Command execution result
   */
  async execute<TCommand extends Command, TResult extends CommandResult>(
    command: TCommand
  ): Promise<TResult> {
    const startTime = performance.now();
    const commandType = command.type;
    const tenantContext = getTenantContext();
    
    try {
      // Find handler
      const handler = this.handlers.get(commandType);
      if (!handler) {
        throw new Error(`No handler registered for command type '${commandType}'`);
      }
      
      // Create validation context with tenant information
      const validationContext = {
        tenantId: tenantContext?.tenantId,
        userId: tenantContext?.userId,
        timestamp: new Date()
      };
      
      // Run validations
      const validationRules = this.validationRules.get(commandType) || [];
      for (const validate of validationRules) {
        const validationResult = await validate(command);
        
        if (!validationResult.valid) {
          await this.metricsCollector.increment(`command.validation.failed.${commandType}`, 1);
          throw new Error(`Command validation failed: ${validationResult.reason}`);
        }
      }
      
      // Execute within transaction
      const result = await this.transactionManager.executeInTransaction(async () => {
        try {
          // Execute handler with tenant context
          return await handler(command, tenantContext?.tenantId);
        } catch (error) {
          // Record execution failures
          await this.metricsCollector.increment(`command.execution.failed.${commandType}`, 1);
          throw error;
        }
      });
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency(`command.execute.${commandType}`, duration);
      await this.metricsCollector.increment(`command.executed.${commandType}`, 1);
      
      return result as TResult;
    } catch (error) {
      // Record failure metrics
      await this.metricsCollector.increment(`command.failed.${commandType}`, 1);
      
      // Log compliance event for failed command
      await ComplianceLogger.log({
        eventType: 'command.execution.failed',
        resourceId: command.payload?.documentId || 'unknown',
        description: `Command execution failed: ${commandType}`,
        metadata: {
          commandType,
          reason: (error as Error).message,
          tenantId: tenantContext?.tenantId
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Execute multiple commands as a batch within a single transaction
   * @param commands Array of commands to execute
   * @returns Array of results in the same order as commands
   */
  async executeBatch<TResult extends CommandResult>(
    commands: Command[]
  ): Promise<TResult[]> {
    if (!commands.length) {
      return [];
    }
    
    const startTime = performance.now();
    
    try {
      // Execute all commands in a single transaction
      const results = await this.transactionManager.executeInTransaction(async () => {
        const resultPromises: Promise<CommandResult>[] = [];
        
        for (const command of commands) {
          // Find handler
          const handler = this.handlers.get(command.type);
          if (!handler) {
            throw new Error(`No handler registered for command type '${command.type}'`);
          }
          
          // Run validations
          const validationRules = this.validationRules.get(command.type) || [];
          for (const validate of validationRules) {
            const validationResult = await validate(command);
            
            if (!validationResult.valid) {
              throw new Error(`Batch command validation failed: ${validationResult.reason}`);
            }
          }
          
          // Execute handler
          const tenantContext = getTenantContext();
          resultPromises.push(handler(command, tenantContext?.tenantId));
        }
        
        return Promise.all(resultPromises);
      });
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('command.batch.execute', duration);
      await this.metricsCollector.recordValue('command.batch.size', commands.length);
      
      return results as TResult[];
    } catch (error) {
      // Record failure metrics
      await this.metricsCollector.increment('command.batch.failed', 1);
      throw error;
    }
  }
  
  /**
   * Get all registered command types
   * @returns Array of registered command type identifiers
   */
  getRegisteredCommandTypes(): string[] {
    return Array.from(this.handlers.keys());
  }
  
  /**
   * Get schema version information for a command type
   * @param commandType Command type identifier
   * @returns Schema version info or undefined if not specified
   */
  getSchemaVersion(commandType: string): { version: string; schemaHash: string } | undefined {
    return this.schemaVersions.get(commandType);
  }
}