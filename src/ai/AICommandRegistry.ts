import { CommandHandler, CommandRegistry } from "../commands/CommandRegistry";
import { getTenantContext } from "../lib/tenantContext";
import { estimateCommandTokens, trackTokenUsage } from "./tokenUtils";
import { DocumentContext } from './ContextProvider'; // Import only DocumentContext
import { AIService } from './AIService';

/**
 * Interface for AI command analysis parameters
 */
export interface AIAnalysisParameters {
  type: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  cache?: boolean;
  cacheTTL?: number;
  priority?: 'high' | 'normal' | 'low';
  [key: string]: any;
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
  documentId: string;
  userId: string;
  parameters: AIAnalysisParameters;
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

export interface AICommandOptions {
  type: string;
  requiresAIAnalysis: boolean;
  executionParameters: {
    timeout: number;
    retries: number;
    priority: 'high' | 'normal' | 'low';
  };
}

/**
 * AI Command Registry
 */
export class AICommandRegistry {
  private commands: Map<string, AICommandOptions> = new Map();

  constructor(
    private commandRegistry: CommandRegistry,
    private aiService: AIService
  ) {}

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
}