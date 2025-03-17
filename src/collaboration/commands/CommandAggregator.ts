import { MetricsCollector } from '../../metrics/collector';
import { DocumentCommand } from './CommandRegistry';
import { getTenantContext } from '../../lib/tenant-context';

interface CommandAggregatorConfig {
  maxBufferTimeMs: number;
  maxBufferSize: number;
  enableAdaptiveBuffering: boolean;
  commandSimilarityThreshold: number;
  enableIntentDetection: boolean;
  maxMergeDistance: number;
}

interface FormattingCommand extends DocumentCommand {
  formatting: Record<string, any>;
  range: { start: number; end: number };
}

interface DeletionCommand extends DocumentCommand {
  position: number;
  length: number;
}

interface TypingCommand extends DocumentCommand {
  text: string;
  position: number;
}

export class CommandAggregator {
  private config: CommandAggregatorConfig;
  private commandBuffer: Map<string, CommandBufferEntry[]> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private adaptiveBufferSize: number;

  constructor(
    private metricsCollector: MetricsCollector,
    config: Partial<CommandAggregatorConfig> = {}
  ) {
    this.config = {
      maxBufferTimeMs: 50,
      maxBufferSize: 10,
      enableAdaptiveBuffering: true,
      commandSimilarityThreshold: 0.8,
      enableIntentDetection: true,
      maxMergeDistance: 50,
      ...config
    };
    this.adaptiveBufferSize = this.config.maxBufferSize;
  }

  async bufferCommand<T extends DocumentCommand>(command: T): Promise<void> {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }

    const bufferKey = `${tenantContext.tenantId}:${command.documentId}`;
    
    if (!this.commandBuffer.has(bufferKey)) {
      this.commandBuffer.set(bufferKey, []);
    }

    const buffer = this.commandBuffer.get(bufferKey)!;
    buffer.push({
      command,
      timestamp: Date.now(),
      intent: this.detectIntent(command)
    });

    // Schedule or trigger flush based on buffer state
    if (this.shouldFlushBuffer(buffer)) {
      await this.flushBuffer(bufferKey);
    } else {
      this.scheduleFlush();
    }
  }

  private detectIntent(command: DocumentCommand): 'typing' | 'formatting' | 'deletion' | 'other' {
    if (this.isTypingCommand(command)) {
      return 'typing';
    }
    if (this.isFormattingCommand(command)) {
      return 'formatting';
    }
    if (this.isDeletionCommand(command)) {
      return 'deletion';
    }
    return 'other';
  }

  private isTypingCommand(command: DocumentCommand): command is TypingCommand {
    return 'text' in command && 
           typeof command.text === 'string' && 
           command.text.length === 1 &&
           'position' in command;
  }

  private isFormattingCommand(command: DocumentCommand): command is FormattingCommand {
    return 'formatting' in command && 'range' in command;
  }

  private isDeletionCommand(command: DocumentCommand): command is DeletionCommand {
    return 'length' in command && 'position' in command;
  }

  private shouldFlushBuffer(buffer: CommandBufferEntry[]): boolean {
    if (buffer.length >= this.adaptiveBufferSize) {
      return true;
    }

    // Check typing pattern breaks
    if (buffer.length > 1) {
      const lastTwo = buffer.slice(-2);
      if (this.isTypingPatternBreak(lastTwo[0], lastTwo[1])) {
        return true;
      }
    }

    return false;
  }

  private isTypingPatternBreak(prev: CommandBufferEntry, curr: CommandBufferEntry): boolean {
    // Detect when typing pattern changes (e.g., pause, different position, etc)
    if (prev.intent !== curr.intent) {
      return true;
    }

    if (prev.intent === 'typing' && curr.intent === 'typing') {
      const timeDiff = curr.timestamp - prev.timestamp;
      const positionDiff = Math.abs(
        this.getCommandPosition(curr.command) - 
        this.getCommandPosition(prev.command)
      );

      // Break if typing pause > 500ms or position jump > 1
      return timeDiff > 500 || positionDiff > 1;
    }

    return false;
  }

  private async flushBuffer(bufferKey: string): Promise<void> {
    const buffer = this.commandBuffer.get(bufferKey);
    if (!buffer || buffer.length === 0) return;

    this.commandBuffer.delete(bufferKey);

    try {
      const groups = this.groupCommandsByIntent(buffer);
      for (const [intent, commands] of groups) {
        await this.processCommandGroup(intent, commands);
      }

      // Update adaptive buffer size based on success
      if (this.config.enableAdaptiveBuffering) {
        this.adaptiveBufferSize = Math.min(
          this.config.maxBufferSize,
          this.adaptiveBufferSize + 1
        );
      }
    } catch (error) {
      // On error, reduce buffer size
      if (this.config.enableAdaptiveBuffering) {
        this.adaptiveBufferSize = Math.max(1, this.adaptiveBufferSize - 1);
      }
      throw error;
    }
  }

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

  private getCommandPosition(command: DocumentCommand): number {
    return 'position' in command ? command.position : 0;
  }

  private async processCommandGroup(intent: string, commands: CommandBufferEntry[]): Promise<void> {
    const startTime = performance.now();
    
    try {
      switch (intent) {
        case 'typing':
          await this.mergeTypingCommands(commands);
          break;
          
        case 'formatting':
          await this.mergeFormattingCommands(commands);
          break;
          
        case 'deletion':
          await this.mergeDeletionCommands(commands);
          break;
          
        default:
          // Process other commands individually
          for (const entry of commands) {
            await this.executeCommand(entry.command);
          }
      }
  
      // Track metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('command.group.processing', duration);
      await this.metricsCollector.increment(`command.group.${intent}`, commands.length);
      
    } catch (error) {
      await this.metricsCollector.incrementPipelineErrors();
      throw error;
    }
  }

  private async mergeTypingCommands(commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length <= 1) {
      const [entry] = commands;
      await this.executeCommand(entry.command);
      return;
    }
  
    // Merge sequential typing commands
    const mergedText = commands
      .map(entry => ('text' in entry.command ? entry.command.text : ''))
      .join('');
      
    const firstCommand = commands[0].command;
    const mergedCommand = {
      ...firstCommand,
      text: mergedText,
      position: this.getCommandPosition(firstCommand)
    };
  
    await this.executeCommand(mergedCommand);
  }

  private async mergeFormattingCommands(commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length <= 1) {
      const [entry] = commands;
      await this.executeCommand(entry.command);
      return;
    }
  
    // Sort by range start position
    const sorted = commands.sort((a, b) => {
      const cmdA = a.command as FormattingCommand;
      const cmdB = b.command as FormattingCommand;
      return cmdA.range.start - cmdB.range.start;
    });
  
    // Find overlapping ranges and merge formatting attributes
    const ranges: Array<{
      start: number;
      end: number;
      formatting: Record<string, any>;
    }> = [];
  
    for (const entry of sorted) {
      const cmd = entry.command as FormattingCommand;
      const overlappingRanges = ranges.filter(
        r => !(r.end < cmd.range.start || r.start > cmd.range.end)
      );
  
      if (overlappingRanges.length === 0) {
        // No overlap, add as new range
        ranges.push({
          start: cmd.range.start,
          end: cmd.range.end,
          formatting: { ...cmd.formatting }
        });
      } else {
        // Merge with overlapping ranges
        const mergedRange = {
          start: Math.min(cmd.range.start, ...overlappingRanges.map(r => r.start)),
          end: Math.max(cmd.range.end, ...overlappingRanges.map(r => r.end)),
          formatting: { ...cmd.formatting }
        };
  
        // Merge formatting attributes from all overlapping ranges
        overlappingRanges.forEach(r => {
          mergedRange.formatting = {
            ...mergedRange.formatting,
            ...r.formatting
          };
        });
  
        // Remove overlapping ranges and add merged one
        ranges.push(mergedRange);
        overlappingRanges.forEach(r => {
          const index = ranges.indexOf(r);
          if (index > -1) {
            ranges.splice(index, 1);
          }
        });
      }
    }
  
    // Execute merged formatting commands
    for (const range of ranges) {
      const mergedCommand: FormattingCommand = {
        ...commands[0].command,
        range: {
          start: range.start,
          end: range.end
        },
        formatting: range.formatting
      };
      await this.executeCommand(mergedCommand);
    }
  }

  private async mergeDeletionCommands(commands: CommandBufferEntry[]): Promise<void> {
    if (commands.length <= 1) {
      const [entry] = commands;
      await this.executeCommand(entry.command);
      return;
    }
  
    // Sort by position in reverse order (for handling backspace operations)
    const sorted = commands.sort((a, b) => {
      const cmdA = a.command as DeletionCommand;
      const cmdB = b.command as DeletionCommand;
      return cmdB.position - cmdA.position;
    });
  
    let currentPosition = (sorted[0].command as DeletionCommand).position;
    let totalLength = 0;
  
    // Merge consecutive deletions
    for (const entry of sorted) {
      const cmd = entry.command as DeletionCommand;
      
      if (cmd.position + cmd.length === currentPosition) {
        // Consecutive deletion
        totalLength += cmd.length;
        currentPosition = cmd.position;
      } else {
        // Non-consecutive, execute current merged deletion if any
        if (totalLength > 0) {
          const mergedCommand: DeletionCommand = {
            ...sorted[0].command,
            position: currentPosition,
            length: totalLength
          };
          await this.executeCommand(mergedCommand);
        }
        // Start new deletion sequence
        currentPosition = cmd.position;
        totalLength = cmd.length;
      }
    }
  
    // Execute final merged deletion
    if (totalLength > 0) {
      const mergedCommand: DeletionCommand = {
        ...sorted[0].command,
        position: currentPosition,
        length: totalLength
      };
      await this.executeCommand(mergedCommand);
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
    }
    
    this.flushTimer = setTimeout(
      () => this.flushAll(),
      this.config.maxBufferTimeMs
    );
  }

  public async flushAll(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    
    const bufferKeys = Array.from(this.commandBuffer.keys());
    for (const key of bufferKeys) {
      await this.flushBuffer(key);
    }
  }

  // Add this method to the CommandAggregator class
  private async executeCommand(command: DocumentCommand): Promise<void> {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }

    try {
      // Get command registry from dependency injection or singleton
      const commandRegistry = this.getCommandRegistry();
      await commandRegistry.execute(command);
      
      // Track successful execution
      await this.metricsCollector.increment(
        `command.${command.type}.executed`, 
        1
      );
    } catch (error) {
      // Track error
      await this.metricsCollector.increment(
        `command.${command.type}.failed`, 
        1
      );
      throw error;
    }
  }

  // Add a method to get the command registry (implementation depends on your DI strategy)
  private getCommandRegistry() {
    // This could be injected via constructor or retrieved from a singleton
    return commandRegistrySingleton;
  }
}

interface CommandBufferEntry {
  command: DocumentCommand;
  timestamp: number;
  intent: string;
}