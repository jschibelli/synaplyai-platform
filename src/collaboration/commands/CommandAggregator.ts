import { CommandRegistry } from '../../commands/CommandRegistry';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenant-context';

/**
 * Interface for document commands
 */
export interface DocumentCommand {
  documentId: string;
  userId: string;
  [key: string]: any;
}

/**
 * Configuration for the command aggregator
 */
export interface CommandAggregatorConfig {
  /** Maximum time to buffer commands before flushing (ms) */
  maxBufferTimeMs: number;
  /** Maximum number of commands to buffer before flushing */
  maxBufferSize: number;
  /** Whether to enable adaptive buffer sizing based on system load */
  enableAdaptiveBuffering: boolean;
}

/**
 * Interface for command buffer entries
 */
interface CommandBufferEntry {
  /** The command to execute */
  command: DocumentCommand;
  /** Timestamp when command was added to buffer */
  timestamp: number;
  /** Detected intent of the command */
  intent: string;
  /** Promise resolver for command execution */
  resolve: (result: any) => void;
  /** Promise rejector for command execution */
  reject: (error: Error) => void;
}

/**
 * Optimizes command execution by aggregating similar commands to improve performance
 */
export class CommandAggregator {
  private commandBuffer: Map<string, CommandBufferEntry[]> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  
  constructor(
    private commandRegistry: CommandRegistry,
    private metricsCollector: MetricsCollector,
    private config: CommandAggregatorConfig = {
      maxBufferTimeMs: 50,
      maxBufferSize: 20,
      enableAdaptiveBuffering: true
    }
  ) {}
  
  /**
   * Buffers a command for potential aggregation
   * @param command The command to buffer
   * @returns Promise that resolves when the command is executed
   */
  async bufferCommand<T extends DocumentCommand>(command: T): Promise<any> {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available for command execution');
    }

    const documentId = command.documentId;
    const bufferKey = `${tenantContext.tenantId}:${documentId}`;
    
    // Create promise that will be resolved when command is executed
    return new Promise<any>((resolve, reject) => {
      try {
        // Check if this command should skip buffering
        if (this.shouldSkipBuffering(command)) {
          // Execute immediately
          this.commandRegistry.execute(command.type, command)
            .then(resolve)
            .catch(reject);
          return;
        }
        
        // Initialize buffer if it doesn't exist
        if (!this.commandBuffer.has(bufferKey)) {
          this.commandBuffer.set(bufferKey, []);
        }
        
        // Add to buffer with metadata
        const buffer = this.commandBuffer.get(bufferKey)!;
        buffer.push({
          command,
          timestamp: Date.now(),
          intent: this.detectIntent(command),
          resolve,
          reject
        });
        
        // Start or reset flush timer
        this.scheduleFlush();
        
        // Flush immediately if buffer threshold reached
        if (this.shouldFlushBuffer(buffer)) {
          this.flushBuffer(bufferKey).catch(err => {
            // Log error but don't reject since individual command rejections will happen
            console.error(`Error flushing buffer for ${bufferKey}:`, err);
          });
        }
      } catch (error) {
        reject(error);
      }
    });
  }
  
  /**
   * Schedules a flush of all buffers
   * @private
   */
  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.flushTimer = setTimeout(
      () => this.flushAll(),
      this.config.maxBufferTimeMs
    );
  }

  /**
   * Force flush all buffers immediately
   * @returns Promise that resolves when all buffers are flushed
   */
  async flushAll(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    const bufferKeys = Array.from(this.commandBuffer.keys());
    for (const key of bufferKeys) {
      try {
        await this.flushBuffer(key);
      } catch (error) {
        console.error(`Error flushing buffer ${key}:`, error);
        // Continue with other buffers even if one fails
      }
    }
  }
  
  /**
   * Flush a specific buffer
   * @param bufferKey Key identifying the buffer to flush
   * @private
   */
  private async flushBuffer(bufferKey: string): Promise<void> {
    const buffer = this.commandBuffer.get(bufferKey);
    if (!buffer || buffer.length === 0) return;
    
    // Remove from buffer
    this.commandBuffer.delete(bufferKey);
    
    // Group by intent
    const commandsByIntent = new Map<string, CommandBufferEntry[]>();
    for (const entry of buffer) {
      if (!commandsByIntent.has(entry.intent)) {
        commandsByIntent.set(entry.intent, []);
      }
      commandsByIntent.get(entry.intent)!.push(entry);
    }
    
    // Process each intent group
    for (const [intent, commands] of commandsByIntent.entries()) {
      try {
        await this.processCommandGroup(intent, commands);
      } catch (error) {
        console.error(`Error processing command group ${intent}:`, error);
        // Reject all commands in this group
        for (const entry of commands) {
          entry.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }
  
  /**
   * Process a group of commands with the same intent
   * @param intent The intent of the commands
   * @param commands The commands to process
   * @private
   */
  private async processCommandGroup(intent: string, commands: CommandBufferEntry[]): Promise<void> {
    const startTime = performance.now();
    
    try {
      switch (intent) {
        case 'typing':
          await this.mergeTypingCommands(commands);
          break;
        case 'deletion':
          await this.processSingleCommands(commands);
          break;
        case 'formatting':
          await this.processSingleCommands(commands);
          break;
        default:
          await this.processSingleCommands(commands);
      }
      
      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency(`command.group.${intent}.process`, duration);
      await this.metricsCollector.increment(`command.group.${intent}.count`, commands.length);
    } catch (error) {
      // If an error occurs, reject all commands
      for (const entry of commands) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
      
      await this.metricsCollector.increment('command.group.failed', 1);
      throw error;
    }
  }
  
  /**
   * Process commands individually without merging
   * @param commands Commands to process
   * @private
   */
  private async processSingleCommands(commands: CommandBufferEntry[]): Promise<void> {
    for (const entry of commands) {
      try {
        const result = await this.commandRegistry.execute(entry.command.type, entry.command);
        entry.resolve(result);
      } catch (error) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }
  
  /**
   * Merge typing commands (insert text)
   * A simplified implementation focused on the development branch needs
   * @private
   */
  private async mergeTypingCommands(commands: CommandBufferEntry[]): Promise<void> {
    // For development simplicity, just process each command individually
    // This is a placeholder for the actual optimization logic
    await this.processSingleCommands(commands);
  }
  
  /**
   * Detects the intent of a command
   * @param command The command to analyze
   * @returns The detected intent
   * @private
   */
  private detectIntent(command: DocumentCommand): string {
    // Check command type and properties to determine intent
    if ('text' in command && typeof command.text === 'string') {
      // Typing commands typically add a single character
      if (command.text.length <= 1) {
        return 'typing';
      }
      return 'text-insertion';
    } else if ('length' in command && 'position' in command && !('attributes' in command)) {
      // Delete operations have length and position but no attributes
      return 'deletion';
    } else if ('attributes' in command) {
      // Format operations have attributes
      return 'formatting';
    }
    
    // Default intent
    return 'unknown';
  }
  
  /**
   * Checks if a command should skip the buffering system
   * @param command The command to check
   * @returns True if the command should skip buffering
   * @private
   */
  private shouldSkipBuffering(command: DocumentCommand): boolean {
    // Skip buffering for:
    
    // 1. Large text insertions (likely paste operations)
    if ('text' in command && typeof command.text === 'string' && command.text.length > 20) {
      return true;
    }
    
    // 2. Commands with special metadata indicating they should execute immediately
    if (command.metadata?.immediate === true) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if buffer should be flushed
   * @param buffer The buffer to check
   * @returns Whether buffer should be flushed
   * @private
   */
  private shouldFlushBuffer(buffer: CommandBufferEntry[]): boolean {
    return buffer.length >= this.config.maxBufferSize;
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
  }
}