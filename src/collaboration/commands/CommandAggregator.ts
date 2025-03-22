import { Command, CommandResult, DocumentCommand } from './types';
import { MetricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenantContext';
import { CommandRegistry } from './CommandRegistry';

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
  /** Threshold for command similarity to be considered for merging (0-1) */
  commandSimilarityThreshold: number;
  /** Whether to enable intent detection for command merging */
  enableIntentDetection: boolean;
  /** Maximum distance between commands to be considered for merging */
  maxMergeDistance: number;
}

/**
 * Insert text command type
 */
interface InsertTextCommand extends DocumentCommand {
  text: string;
  position: number;
}

/**
 * Delete text command type
 */
interface DeleteTextCommand extends DocumentCommand {
  position: number;
  length: number;
}

/**
 * Format text command type
 */
interface FormatTextCommand extends DocumentCommand {
  position: number;
  length: number;
  attributes: Record<string, any>;
}

/**
 * Command buffer entry with metadata
 */
interface CommandBufferEntry {
  /** The command to execute */
  command: DocumentCommand;
  /** Timestamp when command was added to buffer */
  timestamp: number;
  /** Detected intent of the command */
  intent: string;
  /** Promise resolver for command execution */
  resolve: (result: CommandResult) => void;
  /** Promise rejector for command execution */
  reject: (error: Error) => void;
}

/**
 * Optimizes command execution by aggregating similar commands to improve performance
 */
export class CommandAggregator {
  private config: CommandAggregatorConfig;
  private commandBuffer: Map<string, CommandBufferEntry[]> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private adaptiveBufferSize: number;

  /**
   * Creates a new command aggregator
   * @param commandRegistry Registry to execute commands
   * @param metricsCollector Metrics collector for performance tracking
   * @param config Optional configuration settings
   */
  constructor(
    private commandRegistry: CommandRegistry,
    private metricsCollector: MetricsCollector,
    config: Partial<CommandAggregatorConfig> = {}
  ) {
    // Apply default configuration with any overrides
    this.config = {
      maxBufferTimeMs: 50, // 50ms default buffer time
      maxBufferSize: 10,   // Max 10 commands per buffer
      enableAdaptiveBuffering: true,
      commandSimilarityThreshold: 0.8,
      enableIntentDetection: true,
      maxMergeDistance: 10, // Characters between commands to consider merging
      ...config
    };
    
    this.adaptiveBufferSize = this.config.maxBufferSize;
  }

  /**
   * Buffers a command for potential aggregation
   * @param command The command to buffer
   * @returns Promise that resolves when the command is executed
   */
  async bufferCommand<T extends DocumentCommand>(command: T): Promise<CommandResult> {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available for command execution');
    }

    const documentId = command.payload.documentId;
    const bufferKey = `${tenantContext.tenantId}:${documentId}`;
    
    // Create promise that will be resolved when command is executed
    return new Promise<CommandResult>((resolve, reject) => {
      try {
        // Check if this command should skip buffering
        if (this.shouldSkipBuffering(command)) {
          // Execute immediately
          this.commandRegistry.execute(command)
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
   * @param bufferKey The key of the buffer to flush
   * @private
   */
  private async flushBuffer(bufferKey: string): Promise<void> {
    const buffer = this.commandBuffer.get(bufferKey);
    if (!buffer || buffer.length === 0) return;

    // Remove from the map
    this.commandBuffer.delete(bufferKey);
    
    try {
      // Group commands by intent for better aggregation
      const groups = this.groupCommandsByIntent(buffer);
      
      // Process each intent group
      for (const [intent, commands] of groups) {
        await this.processCommandGroup(intent, commands);
      }
      
      // Update adaptive buffer size on success
      if (this.config.enableAdaptiveBuffering) {
        this.adaptiveBufferSize = Math.min(
          this.config.maxBufferSize,
          this.adaptiveBufferSize + 1
        );
      }
      
      // Record metrics
      await this.metricsCollector.recordValue('command.buffer.size', buffer.length);
      await this.metricsCollector.recordLatency('command.buffer.flush', 
        Date.now() - Math.min(...buffer.map(entry => entry.timestamp))
      );
    } catch (error) {
      // Reduce the adaptive buffer size on error
      if (this.config.enableAdaptiveBuffering) {
        this.adaptiveBufferSize = Math.max(1, this.adaptiveBufferSize - 1);
      }
      
      // Reject all buffered commands
      for (const entry of buffer) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
      
      throw error;
    }
  }

  /**
   * Group commands by their detected intent
   * @param buffer Buffer of commands
   * @returns Map of intent to commands
   * @private
   */
  private groupCommandsByIntent(buffer: CommandBufferEntry[]): Map<string, CommandBufferEntry[]> {
    const groups = new Map<string, CommandBufferEntry[]>();
    
    for (const entry of buffer) {
      if (!groups.has(entry.intent)) {
        groups.set(entry.intent, []);
      }
      groups.get(entry.intent)!.push(entry);
    }
    
    return groups;
  }

  /**
   * Process a group of commands with the same intent
   * @param intent The intent of the commands
   * @param commands The commands to process
   * @private
   */
  private async processCommandGroup(intent: string, commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length === 0) return;
    
    const startTime = performance.now();
    
    try {
      // Process based on intent type
      switch (intent) {
        case 'typing':
          await this.mergeTypingCommands(commands);
          break;
          
        case 'deletion':
          await this.mergeDeletionCommands(commands);
          break;
          
        case 'formatting':
          await this.mergeFormattingCommands(commands);
          break;
          
        default:
          // For other intents, execute individually
          for (const entry of commands) {
            const result = await this.commandRegistry.execute(entry.command);
            entry.resolve(result);
          }
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
   * Merge typing commands (insert text)
   * @param commands Commands to merge
   * @private
   */
  private async mergeTypingCommands(commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length <= 1) {
      // No need to merge a single command
      if (commands.length === 1) {
        const entry = commands[0];
        const result = await this.commandRegistry.execute(entry.command);
        entry.resolve(result);
      }
      return;
    }
    
    // Organize commands by typing patterns
    const typingGroups = this.detectTypingPatterns(commands);
    
    for (const group of typingGroups) {
      if (group.length <= 1) {
        // Execute single commands directly
        if (group.length === 1) {
          const entry = group[0];
          const result = await this.commandRegistry.execute(entry.command);
          entry.resolve(result);
        }
        continue;
      }
      
      try {
        // Sort commands by position
        const sorted = [...group].sort((a, b) => {
          const cmdA = a.command as InsertTextCommand;
          const cmdB = b.command as InsertTextCommand;
          return cmdA.position - cmdB.position;
        });
        
        // Check for sequential typing
        const isSequential = this.isSequentialTyping(sorted);
        
        if (isSequential) {
          // Merge sequential typing into one command
          const mergedText = sorted.map(entry => 
            (entry.command as InsertTextCommand).text
          ).join('');
          
          const firstCommand = sorted[0].command as InsertTextCommand;
          const mergedCommand: DocumentCommand = {
            ...firstCommand,
            text: mergedText
          };
          
          // Execute merged command
          const result = await this.commandRegistry.execute(mergedCommand);
          
          // Resolve all promises with the result
          for (const entry of sorted) {
            entry.resolve(result);
          }
          
          // Record aggregation metrics
          await this.metricsCollector.increment('command.typing.aggregated', sorted.length);
          await this.metricsCollector.recordValue('command.typing.reduction', 
            (sorted.length - 1) / sorted.length
          );
        } else {
          // Execute individually if not sequential
          for (const entry of sorted) {
            const result = await this.commandRegistry.execute(entry.command);
            entry.resolve(result);
          }
        }
      } catch (error) {
        // If any command fails, reject all in the group
        for (const entry of group) {
          entry.reject(error instanceof Error ? error : new Error(String(error)));
        }
      }
    }
  }

  /**
   * Merge deletion commands
   * @param commands Commands to merge
   * @private
   */
  private async mergeDeletionCommands(commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length <= 1) {
      // No need to merge a single command
      if (commands.length === 1) {
        const entry = commands[0];
        const result = await this.commandRegistry.execute(entry.command);
        entry.resolve(result);
      }
      return;
    }
    
    try {
      // Sort by position in reverse order (for handling backspace operations)
      const sorted = [...commands].sort((a, b) => {
        const cmdA = a.command as DeleteTextCommand;
        const cmdB = b.command as DeleteTextCommand;
        return cmdB.position - cmdA.position;
      });
      
      // Detect consecutive backspace operations
      const isConsecutiveDeletes = this.isConsecutiveDeletions(sorted);
      
      if (isConsecutiveDeletes) {
        // Determine the total range to delete
        const firstCommand = sorted[sorted.length - 1].command as DeleteTextCommand; // Earliest deletion
        const lastCommand = sorted[0].command as DeleteTextCommand; // Latest deletion
        
        // Calculate the total deletion range
        const startPosition = firstCommand.position;
        const totalLength = lastCommand.position + lastCommand.length - startPosition;
        
        // Create merged delete command
        const mergedCommand: DocumentCommand = {
          ...firstCommand,
          position: startPosition,
          length: totalLength
        };
        
        // Execute merged command
        const result = await this.commandRegistry.execute(mergedCommand);
        
        // Resolve all promises with the result
        for (const entry of sorted) {
          entry.resolve(result);
        }
        
        // Record aggregation metrics
        await this.metricsCollector.increment('command.deletion.aggregated', sorted.length);
        await this.metricsCollector.recordValue('command.deletion.reduction', 
          (sorted.length - 1) / sorted.length
        );
      } else {
        // Execute individually if not consecutive
        for (const entry of commands) {
          const result = await this.commandRegistry.execute(entry.command);
          entry.resolve(result);
        }
      }
    } catch (error) {
      // If any command fails, reject all
      for (const entry of commands) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  /**
   * Merge formatting commands
   * @param commands Commands to merge
   * @private
   */
  private async mergeFormattingCommands(commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length <= 1) {
      // No need to merge a single command
      if (commands.length === 1) {
        const entry = commands[0];
        const result = await this.commandRegistry.execute(entry.command);
        entry.resolve(result);
      }
      return;
    }
    
    try {
      // Sort by position
      const sorted = [...commands].sort((a, b) => {
        const cmdA = a.command as FormatTextCommand;
        const cmdB = b.command as FormatTextCommand;
        return cmdA.position - cmdB.position;
      });
      
      // Find overlapping formatting regions
      const regions = this.findOverlappingFormatRegions(sorted);
      
      // Execute each merged region
      for (const region of regions) {
        const { start, end, entries, attributes } = region;
        
        // Create merged formatting command
        const mergedCommand: DocumentCommand = {
          ...sorted[0].command,
          position: start,
          length: end - start,
          attributes
        };
        
        // Execute merged command
        const result = await this.commandRegistry.execute(mergedCommand);
        
        // Resolve all affected entries
        for (const entry of entries) {
          entry.resolve(result);
        }
      }
      
      // Record aggregation metrics
      await this.metricsCollector.increment('command.formatting.aggregated', sorted.length);
      await this.metricsCollector.recordValue('command.formatting.reduction', 
        (sorted.length - regions.length) / sorted.length
      );
    } catch (error) {
      // If any command fails, reject all
      for (const entry of commands) {
        entry.reject(error instanceof Error ? error : new Error(String(error)));
      }
    }
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
    
    // 2. Large deletion operations (likely selections being deleted)
    if ('length' in command && typeof command.length === 'number' && command.length > 20) {
      return true;
    }
    
    // 3. Commands with special metadata indicating they should execute immediately
    if (command.metadata?.immediate === true) {
      return true;
    }
    
    return false;
  }

  /**
   * Checks if a buffer should be flushed based on size and other factors
   * @param buffer The buffer to check
   * @returns True if the buffer should be flushed
   * @private
   */
  private shouldFlushBuffer(buffer: CommandBufferEntry[]): boolean {
    // Flush if buffer size exceeds the adaptive threshold
    if (buffer.length >= this.adaptiveBufferSize) {
      return true;
    }
    
    // Check for intent changes or pauses, which should trigger flush
    if (buffer.length > 1) {
      // Get the two most recent commands
      const recentCommands = buffer.slice(-2);
      
      // Check for typing pattern break
      if (this.isTypingPatternBreak(recentCommands[0], recentCommands[1])) {
        return true;
      }
      
      // Check for significant time gap between commands
      const timeDiff = recentCommands[1].timestamp - recentCommands[0].timestamp;
      if (timeDiff > 300) { // 300ms pause suggests a natural break
        return true;
      }
    }
    
    return false;
  }

  /**
   * Checks if there's a break in typing pattern
   * @param prev Previous command entry
   * @param curr Current command entry
   * @returns True if there's a pattern break
   * @private
   */
  private isTypingPatternBreak(prev: CommandBufferEntry, curr: CommandBufferEntry): boolean {
    // Different intent is definitely a pattern break
    if (prev.intent !== curr.intent) {
      return true;
    }
    
    // For typing commands, check position continuity
    if (prev.intent === 'typing' && curr.intent === 'typing') {
      const prevCmd = prev.command as InsertTextCommand;
      const currCmd = curr.command as InsertTextCommand;
      
      const expectedPosition = prevCmd.position + prevCmd.text.length;
      
      // If current position isn't at or near expected position, it's a break
      if (Math.abs(currCmd.position - expectedPosition) > 1) {
        return true;
      }
      
      // Significant time gap suggests thinking or separate edits
      const timeDiff = curr.timestamp - prev.timestamp;
      if (timeDiff > 500) { // 500ms is a significant pause when typing
        return true;
      }
    }
    
    return false;
  }

  /**
   * Group typing commands into coherent patterns
   * @param commands The commands to group
   * @returns Array of command groups
   * @private
   */
  private detectTypingPatterns(commands: CommandBufferEntry[]): CommandBufferEntry[][] {
    if (commands.length <= 1) {
      return [commands];
    }
    
    const result: CommandBufferEntry[][] = [];
    let currentGroup: CommandBufferEntry[] = [commands[0]];
    
    for (let i = 1; i < commands.length; i++) {
      const prev = commands[i - 1];
      const curr = commands[i];
      
      if (this.isTypingPatternBreak(prev, curr)) {
        // Start a new group
        result.push(currentGroup);
        currentGroup = [curr];
      } else {
        // Add to current group
        currentGroup.push(curr);
      }
    }
    
    // Add the last group
    if (currentGroup.length > 0) {
      result.push(currentGroup);
    }
    
    return result;
  }

  /**
   * Checks if typing commands are sequential (e.g., typing "hello" one character at a time)
   * @param commands The commands to check, sorted by position
   * @returns True if commands represent sequential typing
   * @private
   */
  private isSequentialTyping(commands: CommandBufferEntry[]): boolean {
    if (commands.length <= 1) {
      return true;
    }
    
    for (let i = 1; i < commands.length; i++) {
      const prev = commands[i - 1].command as InsertTextCommand;
      const curr = commands[i].command as InsertTextCommand;
      
      // Calculate expected position of next character
      const expectedPosition = prev.position + prev.text.length;
      
      // If not at expected position, it's not sequential
      if (Math.abs(curr.position - expectedPosition) > 0) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Checks if deletion commands are consecutive (e.g., pressing backspace multiple times)
   * @param commands The commands to check, sorted by position in reverse order
   * @returns True if commands represent consecutive deletions
   * @private
   */
  private isConsecutiveDeletions(commands: CommandBufferEntry[]): boolean {
    if (commands.length <= 1) {
      return true;
    }
    
    for (let i = 1; i < commands.length; i++) {
      const prev = commands[i - 1].command as DeleteTextCommand;
      const curr = commands[i].command as DeleteTextCommand;
      
      // For backspace operations, positions should be adjacent
      // (prev.position === curr.position + curr.length)
      if (Math.abs(prev.position - (curr.position + curr.length)) > 0) {
        return false;
      }
    }
    
    return true;
  }

  /**
   * Find overlapping format regions and merge their attributes
   * @param commands The formatting commands to analyze, sorted by position
   * @returns Array of merged regions
   * @private
   */
  private findOverlappingFormatRegions(commands: CommandBufferEntry[]): Array<{
    start: number;
    end: number;
    entries: CommandBufferEntry[];
    attributes: Record<string, any>;
  }> {
    if (commands.length === 0) {
      return [];
    }
    
    // Create regions for each command
    const regions: Array<{
      start: number;
      end: number;
      entries: CommandBufferEntry[];
      attributes: Record<string, any>;
    }> = commands.map(entry => {
      const cmd = entry.command as FormatTextCommand;
      return {
        start: cmd.position,
        end: cmd.position + cmd.length,
        entries: [entry],
        attributes: { ...cmd.attributes }
      };
    });
    
    // Merge overlapping regions
    let i = 0;
    while (i < regions.length) {
      let merged = false;
      
      for (let j = i + 1; j < regions.length; j++) {
        // Check for overlap
        if (!(regions[i].end < regions[j].start || regions[i].start > regions[j].end)) {
          // Merge regions
          regions[i] = {
            start: Math.min(regions[i].start, regions[j].start),
            end: Math.max(regions[i].end, regions[j].end),
            entries: [...regions[i].entries, ...regions[j].entries],
            attributes: { ...regions[i].attributes, ...regions[j].attributes }
          };
          
          // Remove the merged region
          regions.splice(j, 1);
          merged = true;
          break;
        }
      }
      
      // Only increment if no merge happened
      if (!merged) {
        i++;
      }
    }
    
    return regions;
  }

  /**
   * Calculate similarity between attribute sets
   * @param attrs1 First attribute set
   * @param attrs2 Second attribute set
   * @returns Similarity score (0-1)
   * @private
   */
  private calculateAttributeSimilarity(
    attrs1: Record<string, any>,
    attrs2: Record<string, any>
  ): number {
    const keys1 = Object.keys(attrs1);
    const keys2 = Object.keys(attrs2);
    
    if (keys1.length === 0 && keys2.length === 0) {
      return 1; // Both empty, perfect similarity
    }
    
    // Count common keys with same values
    let commonKeys = 0;
    
    for (const key of keys1) {
      if (key in attrs2 && attrs1[key] === attrs2[key]) {
        commonKeys++;
      }
    }
    
    // Total unique keys
    const totalKeys = new Set([...keys1, ...keys2]).size;
    
    return commonKeys / totalKeys;
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