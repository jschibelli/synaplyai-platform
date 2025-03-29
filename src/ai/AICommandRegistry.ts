import { CommandHandler, CommandRegistry } from "../commands/CommandRegistry";
import { getTenantContext, TenantContext } from "../lib/tenant-context";
import { estimateCommandTokens, trackTokenUsage } from "./tokenUtils";
import { DocumentContext } from './ContextProvider'; // Import only DocumentContext
import { AIService, AIAnalysisResult } from './AIService';
import { AICommandContext } from './AICommandContext'; // Change this line
import { MetricsCollector } from '../services/metrics/MetricsCollector';
import { CircuitBreaker } from '../lib/circuit-breaker';

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
 * Interface for AI command
 */
export interface AICommand {
  type: string;
  documentId?: string;
  userId?: string;
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
export interface AICommandOptions extends AICommand {
  // Additional properties for tests
  [key: string]: any;
}

/**
 * AI Command context parameters for document context retrieval
 */
export interface AICommandContextParameters {
  windowSize: number;
  includePreceding: boolean;
  includeFollowing: boolean;
  includeDocument: boolean;
  includeMetadata?: boolean;
  trackCollaborativeChanges?: boolean;
  detectIntent?: boolean;
  intentPriorities?: string[];
  fallbackToPartialContext?: boolean;
  allowMultipleIntents?: boolean;
  reuseContext?: boolean;
  position?: number;  // Cursor position for context
  selectionStart?: number;  // Start of selected text
  selectionEnd?: number;    // End of selected text
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
 * Execution parameters to control how commands are executed
 */
export interface AICommandExecutionParameters {
  timeout?: number;  // Maximum execution time in ms
  retries?: number;  // Number of retries on failure
  priority?: 'high' | 'normal' | 'low';
  
  // Support for test compatibility
  cleanupRequired?: boolean;
  resourceLimits?: {
    maxTokens?: number;
    maxLatency?: number;
    maxMemoryMB?: number;
  };
  rateLimit?: {
    maxRequests?: number;
    windowMs?: number;
  };
  concurrencyLimit?: number;
  retryDelay?: number;
  [key: string]: any; // Allow any test properties
}

/**
 * Options for AI command execution
 */
export interface AICommandOptions {
  type: string;
  requiresAIAnalysis?: boolean;
  executionParameters?: {
    timeout?: number;
    retries?: number;
    priority?: 'high' | 'normal' | 'low';
    
    // Add test compatibility properties
    cleanupRequired?: boolean;
    resourceLimits?: {
      maxTokens?: number;
      maxLatency?: number;
      maxMemoryMB?: number;
    };
    rateLimit?: {
      maxRequests?: number;
      windowMs?: number;
    };
    concurrencyLimit?: number;
    retryDelay?: number;
    [key: string]: any; // Allow any test properties
  };
  [key: string]: any; // Allow additional properties
}

/**
 * Result of command validation
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
  errors?: string[];
}

/**
 * Handler function for AI commands
 * Supports both direct call and execute() method patterns for backward compatibility
 */
export interface AICommandHandler<T = any, R = any> {
  (command: T, context: AICommandContext): Promise<R>;
  execute?: (command: T, context: AICommandContext) => Promise<R>;
}

/**
 * Validator function for AI commands
 */
export type AICommandValidator = (
  command: AICommand
) => Promise<ValidationResult> | ValidationResult;

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

// Define command types for test compatibility
export interface GrammarCheckCommand extends AICommand {
  type: 'GRAMMAR_CHECK';
  selectionStart: number;
  selectionEnd: number;
}

export interface CompleteTextCommand extends AICommand {
  type: 'COMPLETE_TEXT';
  position: number;
  maxTokens?: number;
}

export interface SemanticRewriteCommand extends AICommand {
  type: 'SEMANTIC_REWRITE';
  selectionStart: number;
  selectionEnd: number;
  intent: {
    tone?: string;
    style?: string;
    audience?: string;
    [key: string]: any;
  };
}

export interface TextRewriteCommand extends AICommand {
  type: 'TEXT_REWRITE';
  selectionStart: number;
  selectionEnd: number;
  instructions: string;
}



export interface AICommandContext {
  documentId: string;
  userId: string;
  tenantId: string;
  document?: {
    content: string;
    metadata?: any;
  };
  selection?: {
    start: number;
    end: number;
    text: string;
  };
  aiAnalysisResult?: any;
  selectedText?: string;
  precedingText?: string;
  followingText?: string;
  documentMetadata?: any;
  onProgress?: (update: string) => void;
  onToken?: (token: any) => void;
  [key: string]: any;
}

