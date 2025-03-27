import { CommandHandler, CommandRegistry } from "../commands/CommandRegistry";
import { getTenantContext } from "../lib/tenant-context";
import { estimateCommandTokens, trackTokenUsage } from "./tokenUtils";
import { DocumentContext } from './ContextProvider'; // Import only DocumentContext
import { AIService } from './AIService';
import { CircuitBreaker } from '../circuit-breaker/CircuitBreaker';
import { MetricsCollector } from '../services/metrics/MetricsCollector';

/**
 * Interface for AI command analysis parameters
 */
export interface AIAnalysisParameters {
  type: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  retryAttempts?: number;
  [key: string]: any; // Allow additional properties for testing
}

/**
 * Interface for AI command context parameters
 */
export interface AICommandContext {
  documentId: string;
  userId: string;
  tenantId: string;
  context: DocumentContext;
  parameters: AIAnalysisParameters;
}

/**
 * Interface for AI command
 */
export interface AICommand {
  type: string;
  requiresAIAnalysis: boolean;
  contextParameters?: AICommandContextParameters;
  executionParameters?: AICommandExecutionParameters;
  [key: string]: any; // Allow additional properties for testing
}

/**
 * Interface for AI analysis result
 */
export interface AIAnalysisResult {
  content: string;
  modelId: string;
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  metadata?: Record<string, any>;
}

/**
 * AI Command options and configuration
 */
export interface AICommandOptions {
  [key: string]: any; // Allow additional properties for testing
}

/**
 * AI Command context parameters for document context retrieval
 */
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument?: boolean;
  includeMetadata?: boolean;
  trackCollaborativeChanges?: boolean;
  detectIntent?: boolean;
  intentPriorities?: string[];
  fallbackToPartialContext?: boolean;
  allowMultipleIntents?: boolean;
  reuseContext?: boolean;
  [key: string]: any; // Allow additional properties for testing
}

/**
 * AI Command analysis parameters for AI processing
 */
export interface AICommandAnalysisParameters {
  type: string;
  model: string;
  temperature?: number;
  maxTokens?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

/**
 * Complete text command parameters
 */
export interface CompleteTextCommand extends AICommand {
  type: 'COMPLETE_TEXT' | 'AUTO_DETECT';
  documentId: string;
  userId: string;
  position: number;
  prompt?: string;
  contextParameters: AICommandContextParameters;
  analysisParameters?: {
    type: 'COMPLETE_TEXT' | 'AUTO_DETECT';
    model?: string;
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
  };
  parameters?: AIAnalysisParameters;
  [key: string]: any; // Allow additional properties for testing
}

/**
 * AI Command Registry
 */
export class AICommandRegistry {
  private commands: Map<string, AICommandOptions> = new Map();
  private handlers: Map<string, AICommandHandler> = new Map();
  private validators: Map<string, (command: AICommand) => Promise<boolean>> = new Map();
  private metricsCollector: MetricsCollector;
  private circuitBreaker: CircuitBreaker;

  constructor(
    private commandRegistry: CommandRegistry,
    private aiService: AIService,
    metricsCollector: MetricsCollector,
    circuitBreaker: CircuitBreaker
  ) {
    this.metricsCollector = metricsCollector;
    this.circuitBreaker = circuitBreaker;
  }

  /**
   * Register AI command handlers
   */
  registerHandlers() {
    // Register complete text handler
    this.commandRegistry.register('COMPLETE_TEXT', async (command) => {
      const analysis = await this.aiService.analyze(command.parameters);
      const result = await this.commandRegistry.execute('INSERT_TEXT', {
        documentId: command.documentId,
        position: command.parameters.position,
        text: analysis.content,
        userId: command.userId
      });
      return result;
    });
    
    // Register rewrite selection handler
    this.commandRegistry.register('REWRITE_SELECTION', async (command) => {
      const analysis = await this.aiService.analyze(command.parameters);
      const result = await this.commandRegistry.execute('REPLACE_TEXT', {
        documentId: command.documentId,
        startPosition: command.parameters.startPosition,
        endPosition: command.parameters.endPosition,
        newText: analysis.content,
        userId: command.userId
      });
      return result;
    });
    
    // Register summarize selection handler
    this.commandRegistry.register('SUMMARIZE_SELECTION', async (command) => {
      const analysis = await this.aiService.analyze(command.parameters);
      const result = await this.commandRegistry.execute('REPLACE_TEXT', {
        documentId: command.documentId,
        startPosition: command.parameters.startPosition,
        endPosition: command.parameters.endPosition,
        newText: analysis.content,
        userId: command.userId
      });
      return result;
    });
    
    // Register improve writing handler
    this.commandRegistry.register('IMPROVE_WRITING', async (command) => {
      const analysis = await this.aiService.analyze(command.parameters);
      const result = await this.commandRegistry.execute('REPLACE_TEXT', {
        documentId: command.documentId,
        startPosition: command.parameters.startPosition,
        endPosition: command.parameters.endPosition,
        newText: analysis.content,
        userId: command.userId
      });
      return result;
    });
  }

  registerAICommand(command: AICommandOptions): void {
    this.commands.set(command.type, command);
  }

  executeCommand(command: AICommandOptions, context: any): Promise<any> {
    // Implement command execution logic here
    return Promise.resolve();
  }

  // Register a command handler
  register(
    commandType: string, 
    handler: AICommandHandler,
    options: {
      validator?: (command: AICommand) => Promise<boolean>;
      [key: string]: any;
    } = {}
  ): AICommandRegistry {
    this.handlers.set(commandType, handler);
    if (options.validator) {
      this.validators.set(commandType, options.validator);
    }
    return this;
  }

  // Execute a command
  async executeCommand(command: AICommand, options: AICommandOptions = {}): Promise<any> {
    // Implementation would go here
    return null;
  }
}