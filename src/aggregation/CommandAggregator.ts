import { getTenantContext } from '../lib/tenant-context';
import { CommandRegistry, CommandResult, DocumentCommand, InsertTextCommand, DeleteTextCommand, FormatTextCommand } from '../commands/CommandRegistry';
import { BaseEvent } from '../events/EventStore';
import { MetricsCollector } from '../metrics/metrics-collector';

/**
 * Configuration options for the CommandAggregator
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
 * Command buffer entry containing the command and metadata
 */
interface CommandBufferEntry<T extends DocumentCommand = DocumentCommand> {
  /** Type of the command */
  type: string;
  /** Command payload */
  command: T;
  /** Timestamp when the command was added to the buffer */
  addedAt: number;
  /** Section or region identifier this command affects */
  sectionId?: string;
  /** Document identifier */
  documentId: string;
  /** Promise resolver function to complete when command is executed */
  resolve: (result: CommandResult) => void;
  /** Promise rejector function for command errors */
  reject: (error: Error) => void;
}

/**
 * Result of an aggregation operation
 */
interface AggregationResult<T extends DocumentCommand = DocumentCommand> {
  /** Whether aggregation was successful */
  aggregated: boolean;
  /** Type of the aggregated command */
  type: string;
  /** Aggregated command payload */
  command?: T;
  /** Original commands that were aggregated */
  originalCommands: CommandBufferEntry[];
}

/**
 * The CommandAggregator buffers, organizes, and optimizes command execution 
 * by intelligently aggregating similar commands to improve performance
 */
export class CommandAggregator {
  private config: CommandAggregatorConfig;
  private commandRegistry: CommandRegistry;
  private metricsCollector: MetricsCollector;
  private commandBuffer: Map<string, CommandBufferEntry[]> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private adaptiveBufferSize: number;
  
  /**
   * Creates a new command aggregator
   * @param commandRegistry Command registry to execute commands
   * @param metricsCollector Metrics collector for monitoring
   * @param config Configuration for the aggregator
   */
  constructor(
    commandRegistry: CommandRegistry, 
    metricsCollector: MetricsCollector,
    config: Partial<CommandAggregatorConfig> = {}
  ) {
    this.commandRegistry = commandRegistry;
    this.metricsCollector = metricsCollector;
    this.config = {
      maxBufferTimeMs: 50, // 50ms default buffer time
      maxBufferSize: 10, // Max 10 commands per buffer
      enableAdaptiveBuffering: true,
      commandSimilarityThreshold: 0.8,
      enableIntentDetection: true,
      maxMergeDistance: 50, // Characters between commands to consider merging
      ...config
    };
    this.adaptiveBufferSize = this.config.maxBufferSize;
  }
  
  /**
   * Execute a command, potentially buffering it for aggregation
   * @param type Command type identifier
   * @param command Command payload
   * @returns Promise that resolves with command result
   */
  async executeCommand<T extends DocumentCommand, E extends BaseEvent = any>(
    type: string,
    command: T
  ): Promise<CommandResult<E>> {
    // Extract document ID for buffer organization
    const documentId = command.documentId;
    
    // Check if this command can be executed immediately without buffering
    if (this.shouldSkipBuffering(type, command)) {
      return this.commandRegistry.execute<T, E>(type, command);
    }
    
    // Create a promise that will resolve when the command is executed
    return new Promise<CommandResult<E>>((resolve, reject) => {
      // Create a buffer entry
      const entry: CommandBufferEntry<T> = {
        type,
        command,
        addedAt: Date.now(),
        documentId,
        resolve: resolve as any, // Type assertion to handle the generic properly
        reject
      };
      
      // Determine section ID for more granular buffering
      entry.sectionId = this.getSectionId(type, command);
      
      // Add to buffer
      this.addToBuffer(entry);
      
      // Start or reset flush timer
      this.scheduleFlush();
      
      // Check if we should flush immediately
      if (this.shouldFlushBuffer(documentId)) {
        this.flushBuffer(documentId);
      }
    });
  }
  
  /**
   * Add a command to the buffer
   * @param entry Command buffer entry
   * @private
   */
  private addToBuffer(entry: CommandBufferEntry): void {
    const { documentId } = entry;
    
    if (!this.commandBuffer.has(documentId)) {
      this.commandBuffer.set(documentId, []);
    }
    
    this.commandBuffer.get(documentId)!.push(entry);
  }
  
  /**
   * Schedule a buffer flush
   * @private
   */
  private scheduleFlush(): void {
    // Clear existing timer if any
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    // Set new timer
    this.flushTimer = setTimeout(() => {
      this.flushAllBuffers();
    }, this.config.maxBufferTimeMs);
  }
  
  /**
   * @private
   */
  private async flushAllBuffers(): Promise<void> {
    const documentIds = Array.from(this.commandBuffer.keys());

    for (const documentId of documentIds) {
      // existing implementation
    }
  }
  
  /**
   * Flush the buffer for a specific document
   * @param documentId Document ID
   * @private
   */
  private async flushBuffer(documentId: string): Promise<void> {
    const bufferEntries = this.commandBuffer.get(documentId);
    if (!bufferEntries || bufferEntries.length === 0) {
      return;
    }
    
    // Remove from buffer
    this.commandBuffer.delete(documentId);
    
    try {
      // Group commands by section for better aggregation
      const sectionBuffers = this.groupBySection(bufferEntries);
      
      // Process each section
      for (const [sectionId, entries] of sectionBuffers) {
        await this.processSectionBuffer(sectionId, entries);
      }
      
      // Update adaptive buffer size based on success
      if (this.config.enableAdaptiveBuffering) {
        this.adaptiveBufferSize = Math.min(
          this.config.maxBufferSize, 
          this.adaptiveBufferSize + 1
        );
      }
    } catch (error) {
      console.error(`Error flushing command buffer for document ${documentId}:`, error);
      
      // Reduce adaptive buffer size on error
      if (this.config.enableAdaptiveBuffering) {
        this.adaptiveBufferSize = Math.max(1, this.adaptiveBufferSize - 1);
      }
      
      // Reject all pending commands
      bufferEntries.forEach(entry => {
        entry.reject(error as Error);
      });
    }
  }
  
  /**
   * Process a buffer of commands for a specific section
   * @param sectionId Section identifier
   * @param entries Command entries
   * @private
   */
  private async processSectionBuffer(
    sectionId: string, 
    entries: CommandBufferEntry[]
  ): Promise<void> {
    // Start aggregation by attempting to merge commands
    const aggregatedCommands = this.aggregateCommands(entries);
    
    // Execute each aggregated command
    for (const aggregation of aggregatedCommands) {
      try {
        let result: CommandResult;
        
        if (aggregation.aggregated && aggregation.command) {
          // Execute the aggregated command
          result = await this.commandRegistry.execute(
            aggregation.type,
            aggregation.command
          );
          
          // Simple count increment instead of complex tracking
          await this.metricsCollector.increment('command.aggregated', { count: '1' });
        } else {
          // Execute the original command (no aggregation was possible)
          const entry = aggregation.originalCommands[0];
          result = await this.commandRegistry.execute(
            entry.type,
            entry.command
          );
        }
        
        // Resolve all promises with the result
        for (const entry of aggregation.originalCommands) {
          entry.resolve(result);
        }
      } catch (error) {
        // Reject all promises with the error
        for (const entry of aggregation.originalCommands) {
          entry.reject(error as Error);
        }
      }
    }
  }
  
  /**
   * Group command buffer entries by section
   * @param entries Command buffer entries
   * @returns Map of section ID to command entries
   * @private
   */
  private groupBySection(entries: CommandBufferEntry[]): Map<string, CommandBufferEntry[]> {
    const sectionBuffers = new Map<string, CommandBufferEntry[]>();
    
    for (const entry of entries) {
      const sectionId = entry.sectionId || 'default';
      
      if (!sectionBuffers.has(sectionId)) {
        sectionBuffers.set(sectionId, []);
      }
      
      sectionBuffers.get(sectionId)!.push(entry);
    }
    
    return sectionBuffers;
  }
  
  /**
   * Aggregate commands to reduce the number of operations
   * @param entries Command buffer entries
   * @returns Array of aggregation results
   * @private
   */
  private aggregateCommands(entries: CommandBufferEntry[]): AggregationResult[] {
    if (entries.length <= 1) {
      // No aggregation possible with 0 or 1 commands
      return entries.map(entry => ({
        aggregated: false,
        type: entry.type,
        originalCommands: [entry]
      }));
    }
    
    // Sort entries by position (for text operations)
    const sortedEntries = [...entries].sort((a, b) => {
      const posA = this.getCommandPosition(a.command);
      const posB = this.getCommandPosition(b.command);
      return posA - posB;
    });
    
    const results: AggregationResult[] = [];
    let currentGroup: CommandBufferEntry[] = [sortedEntries[0]];
    let currentType = sortedEntries[0].type;
    
    // Group consecutive commands of the same type
    for (let i = 1; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];
      
      if (this.canMergeCommands(currentGroup, entry)) {
        // Add to current group
        currentGroup.push(entry);
      } else {
        // Process current group
        results.push(this.mergeCommandGroup(currentType, currentGroup));
        
        // Start new group
        currentGroup = [entry];
        currentType = entry.type;
      }
    }
    
    // Process final group
    if (currentGroup.length > 0) {
      results.push(this.mergeCommandGroup(currentType, currentGroup));
    }
    
    return results;
  }
  
  /**
   * Merge a group of commands of the same type
   * @param type Command type
   * @param entries Command buffer entries
   * @returns Aggregation result
   * @private
   */
  private mergeCommandGroup(
    type: string, 
    entries: CommandBufferEntry[]
  ): AggregationResult {
    if (entries.length === 1) {
      // No merging needed for single commands
      return {
        aggregated: false,
        type,
        originalCommands: entries
      };
    }
    
    switch (type) {
      case 'INSERT_TEXT':
        return this.mergeInsertTextCommands(
          entries as CommandBufferEntry<InsertTextCommand>[]
        );
        
      case 'DELETE_TEXT':
        return this.mergeDeleteTextCommands(
          entries as CommandBufferEntry<DeleteTextCommand>[]
        );
        
      case 'FORMAT_TEXT':
        return this.mergeFormatTextCommands(
          entries as CommandBufferEntry<FormatTextCommand>[]
        );
        
      default:
        // For unknown command types, don't aggregate
        return {
          aggregated: false,
          type,
          originalCommands: entries
        };
    }
  }
  
  /**
   * Merge multiple INSERT_TEXT commands
   * @param entries Command buffer entries
   * @returns Aggregation result
   * @private
   */
  private mergeInsertTextCommands(
    entries: CommandBufferEntry<InsertTextCommand>[]
  ): AggregationResult<InsertTextCommand> {
    // For INSERT_TEXT, we can merge consecutive inserts at adjacent positions
    if (entries.length < 2) {
      return {
        aggregated: false,
        type: 'INSERT_TEXT',
        originalCommands: entries
      };
    }
    
    // Sort by position
    const sorted = [...entries].sort((a, b) => a.command.position - b.command.position);
    
    // Check if positions are adjacent
    for (let i = 1; i < sorted.length; i++) {
      const prevCommand = sorted[i - 1].command;
      const currCommand = sorted[i].command;
      
      // If positions aren't adjacent or close enough, can't merge
      const expectedPosition = prevCommand.position + prevCommand.text.length;
      if (Math.abs(currCommand.position - expectedPosition) > this.config.maxMergeDistance) {
        return {
          aggregated: false,
          type: 'INSERT_TEXT',
          originalCommands: entries
        };
      }
    }
    
    // Merge the commands
    const firstCommand = sorted[0].command;
    let mergedText = firstCommand.text;
    let lastPosition = firstCommand.position + firstCommand.text.length;
    
    for (let i = 1; i < sorted.length; i++) {
      const command = sorted[i].command;
      
      // Add any gap text if needed
      if (command.position > lastPosition) {
        // This means there's a gap - in a real-world scenario, you might
        // need to fetch the document content for this gap
        const gapSize = command.position - lastPosition;
        mergedText += ' '.repeat(gapSize); // Placeholder for gap
      }
      
      mergedText += command.text;
      lastPosition = command.position + command.text.length;
    }
    
    // Create aggregated command
    const mergedCommand: InsertTextCommand = {
      documentId: firstCommand.documentId,
      userId: firstCommand.userId,
      position: firstCommand.position,
      text: mergedText
    };
    
    return {
      aggregated: true,
      type: 'INSERT_TEXT',
      command: mergedCommand,
      originalCommands: entries
    };
  }
  
  /**
   * Merge multiple DELETE_TEXT commands
   * @param entries Command buffer entries
   * @returns Aggregation result
   * @private
   */
  private mergeDeleteTextCommands(
    entries: CommandBufferEntry<DeleteTextCommand>[]
  ): AggregationResult<DeleteTextCommand> {
    if (entries.length < 2) {
      return {
        aggregated: false,
        type: 'DELETE_TEXT',
        originalCommands: entries
      };
    }
    
    // Sort by position in descending order to handle overlapping deletes
    const sorted = [...entries].sort((a, b) => b.command.position - a.command.position);
    
    // Check for overlapping or adjacent deletes
    // For DELETE operations, we process from end to beginning to avoid position shifting
    // This is a complex area that would need document content awareness in a real implementation
    
    // For now, we'll implement a simple case: when deletes are consecutive backspaces
    let isConsecutiveBackspaces = true;
    let previousPosition = sorted[0].command.position;
    
    for (let i = 1; i < sorted.length; i++) {
      const command = sorted[i].command;
      
      // Check if this is a backspace operation (delete 1 character just before previous position)
      if (command.length !== 1 || command.position !== previousPosition - 1) {
        isConsecutiveBackspaces = false;
        break;
      }
      
      previousPosition = command.position;
    }
    
    if (isConsecutiveBackspaces) {
      // Merge consecutive backspaces into one delete operation
      const firstCommand = sorted[sorted.length - 1].command; // Earliest command
      const lastCommand = sorted[0].command; // Latest command
      
      const mergedCommand: DeleteTextCommand = {
        documentId: firstCommand.documentId,
        userId: firstCommand.userId,
        position: firstCommand.position,
        length: (lastCommand.position - firstCommand.position) + 1
      };
      
      return {
        aggregated: true,
        type: 'DELETE_TEXT',
        command: mergedCommand,
        originalCommands: entries
      };
    }
    
    // If not consecutive backspaces, don't aggregate
    return {
      aggregated: false,
      type: 'DELETE_TEXT',
      originalCommands: entries
    };
  }
  
  /**
   * Merge multiple FORMAT_TEXT commands
   * @param entries Command buffer entries
   * @returns Aggregation result
   * @private
   */
  private mergeFormatTextCommands(
    entries: CommandBufferEntry<FormatTextCommand>[]
  ): AggregationResult<FormatTextCommand> {
    if (entries.length < 2) {
      return {
        aggregated: false,
        type: 'FORMAT_TEXT',
        originalCommands: entries
      };
    }
    
    // Sort by position
    const sorted = [...entries].sort((a, b) => a.command.position - b.command.position);
    
    // Check if there's complete overlap - one format contains all others
    // This is a common case when multiple formatting attributes are applied
    // to the same text range
    const regions = sorted.map(entry => ({
      start: entry.command.position,
      end: entry.command.position + entry.command.length
    }));
    
    // Find enclosing region if it exists
    let enclosingRegionIndex = -1;
    
    for (let i = 0; i < regions.length; i++) {
      const region = regions[i];
      const enclosesAll = regions.every((r, j) => 
        i === j || (r.start >= region.start && r.end <= region.end)
      );
      
      if (enclosesAll) {
        enclosingRegionIndex = i;
        break;
      }
    }
    
    if (enclosingRegionIndex >= 0) {
      // Merge attributes of all commands into the enclosing command
      const baseCommand = sorted[enclosingRegionIndex].command;
      const mergedAttributes = { ...baseCommand.attributes };
      
      // Merge all attributes
      for (const entry of sorted) {
        if (entry !== sorted[enclosingRegionIndex]) {
          Object.assign(mergedAttributes, entry.command.attributes);
        }
      }
      
      const mergedCommand: FormatTextCommand = {
        documentId: baseCommand.documentId,
        userId: baseCommand.userId,
        position: baseCommand.position,
        length: baseCommand.length,
        attributes: mergedAttributes
      };
      
      return {
        aggregated: true,
        type: 'FORMAT_TEXT',
        command: mergedCommand,
        originalCommands: entries
      };
    }
    
    // If no enclosing region, don't aggregate
    return {
      aggregated: false,
      type: 'FORMAT_TEXT',
      originalCommands: entries
    };
  }
  
  /**
   * Check if two commands can be merged
   * @param currentGroup Current group of commands
   * @param entry Command entry to check
   * @returns Whether commands can be merged
   * @private
   */
  private canMergeCommands(
    currentGroup: CommandBufferEntry[], 
    entry: CommandBufferEntry
  ): boolean {
    if (currentGroup.length === 0) {
      return true;
    }
    
    const firstEntry = currentGroup[0];
    
    // Must be same type and document
    if (firstEntry.type !== entry.type || 
        firstEntry.documentId !== entry.documentId) {
      return false;
    }
    
    // Must be same section if section-aware
    if (firstEntry.sectionId && entry.sectionId && 
        firstEntry.sectionId !== entry.sectionId) {
      return false;
    }
    
    // Must be from same user
    if (firstEntry.command.userId !== entry.command.userId) {
      return false;
    }
    
    // Check command-specific mergeability
    switch (firstEntry.type) {
      case 'INSERT_TEXT': {
        const firstPos = this.getCommandPosition(firstEntry.command);
        const entryPos = this.getCommandPosition(entry.command);
        return Math.abs(entryPos - firstPos) <= this.config.maxMergeDistance;
      }
        
      case 'DELETE_TEXT': {
        // For delete operations, check if they're adjacent or overlapping
        const firstPos = this.getCommandPosition(firstEntry.command);
        const firstLen = (firstEntry.command as DeleteTextCommand).length;
        const entryPos = this.getCommandPosition(entry.command);
        
        return Math.abs(entryPos - (firstPos + firstLen)) <= 1;
      }
        
      case 'FORMAT_TEXT': {
        // For format operations, check attribute similarity
        const firstAttrs = (firstEntry.command as FormatTextCommand).attributes;
        const entryAttrs = (entry.command as FormatTextCommand).attributes;
        
        const similarity = this.calculateAttributeSimilarity(firstAttrs, entryAttrs);
        return similarity >= this.config.commandSimilarityThreshold;
      }
        
      default:
        return false;
    }
  }
  
  /**
   * Calculate similarity between two attribute sets (0-1)
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
   * Get position from a command
   * @param command Command object
   * @returns Position within document
   * @private
   */
  private getCommandPosition(command: DocumentCommand): number {
    if ('position' in command) {
      return (command as any).position;
    }
    return 0;
  }
  
  /**
   * Get section ID for a command
   * @param type Command type
   * @param command Command payload
   * @returns Section identifier
   * @private
   */
  private getSectionId(type: string, command: DocumentCommand): string {
    // In a real implementation, this would identify document sections
    // For now, use a simplified approach based on position ranges
    
    const position = this.getCommandPosition(command);
    
    // Section size of 1000 characters
    const sectionSize = 1000;
    const sectionId = `section-${Math.floor(position / sectionSize)}`;
    
    return `${command.documentId}:${sectionId}`;
  }
  
  /**
   * Check if the command should skip buffering
   * @param type Command type
   * @param command Command payload
   * @returns Whether to skip buffering
   * @private
   */
  private shouldSkipBuffering(type: string, command: DocumentCommand): boolean {
    // Skip buffering for commands that should execute immediately
    // This could be based on command type, size, or other factors
    
    // For example, skip buffering for large text insertions
    if (type === 'INSERT_TEXT' && 
        (command as InsertTextCommand).text.length > 100) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if buffer should be flushed immediately
   * @param documentId Document identifier
   * @returns Whether buffer should be flushed
   * @private
   */
  private shouldFlushBuffer(documentId: string): boolean {
    const buffer = this.commandBuffer.get(documentId);
    
    if (!buffer) {
      return false;
    }
    
    // Flush if buffer exceeds current adaptive size
    return buffer.length >= this.adaptiveBufferSize;
  }
  
  /**
   * Force flush all pending commands immediately
   * @returns Promise that resolves when all commands are flushed
   */
  async flushAll(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    await this.flushAllBuffers();
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