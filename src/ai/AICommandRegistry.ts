import { CommandHandler, CommandRegistry } from "../commands/CommandRegistry";
import { getTenantContext } from "../lib/tenant-context";
import { estimateCommandTokens, trackTokenUsage } from "./tokenUtils";
import { ContextProvider, DocumentContext } from './ContextProvider';
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
export interface AICommandContextParameters {
  windowSize?: number;
  includePreceding?: boolean;
  includeFollowing?: boolean;
  includeMetadata?: boolean;
  includeFormatting?: boolean;
}

/**
 * Interface for AI command results
 */
export interface AIAnalysisResult {
  content: string;
  modelId: string;
  totalTokens: number;
  promptTokens?: number;
  completionTokens?: number;
  metadata?: Record<string, any>;
}

/**
 * Interface for AI analysis result
 */
export interface AIAnalysisResult {
  content: string;
  modelId: string;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  metadata?: {
    responseTime?: number;
    operationId?: string;
    cacheHit?: boolean;
    parameters?: Record<string, any>;
    promptLength?: number;
    corrections?: any[];
    [key: string]: any;
  };
}

/**
 * Base interface for AI commands
 */
export interface AICommand {
  type: string;
  documentId: string;
  userId: string;
  contextParameters?: AICommandContextParameters;
  analysisParameters?: AIAnalysisParameters;
  requiresAIAnalysis: boolean;
}

/**
 * Base interface for AI commands
 */
export interface AICommand {
  type: string;
  documentId: string;
  userId: string;
  contextParameters?: {
    windowSize?: number;
    includePreceding?: boolean;
    includeFollowing?: boolean;
    includeMetadata?: boolean;
    position?: number;
    [key: string]: any;
  };
  analysisParameters?: AIAnalysisParameters;
  requiresAIAnalysis: boolean;
  [key: string]: any;
}

/**
 * Handler type for AI commands
 */
export type AICommandHandler<T extends AICommand, E> = (
  command: T,
  context: DocumentContext,
  analysis?: AIAnalysisResult
) => Promise<E>;

/**
 * Options for AI commands
 */
export interface AICommandOptions {
  validator?: (command: AICommand) => Promise<void>;
  usageTracking?: boolean;
  circuitBreaker?: boolean;
  tenantIsolation?: boolean;
}

/**
 * Validation result interface
 */
export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/**
 * Validator function for AI commands
 */
export type AICommandValidator<T extends AICommand> = (command: T) => Promise<ValidationResult> | ValidationResult;

/**
 * Handler function for AI commands
 */
export type AICommandHandler<T extends AICommand, R = any> = (
  command: T,
  context: DocumentContext,
  analysis?: AIAnalysisResult
) => Promise<R>;

/**
 * Options for AI command registration
 */
export interface AICommandRegistrationOptions {
  validator?: AICommandValidator<any>;
  usageTracking?: boolean;
  circuitBreaker?: boolean;
  tenantIsolation?: boolean;
  schemaVersion?: {
    version: string;
    schemaHash: string;
  };
  timeoutMs?: number;
  retry?: {
    maxAttempts: number;
    backoffFactor: number;
    initialDelayMs: number;
  };
}

/**
 * Service for providing document context
 */
export interface ContextProvider {
  getContext(
    documentId: string,
    parameters?: AICommandContextParameters
  ): Promise<DocumentContext>;
}

/**
 * Service for AI operations
 */
export interface AIService {
  analyze(
    context: DocumentContext,
    parameters?: AIAnalysisParameters
  ): Promise<AIAnalysisResult>;
}

/**
 * Usage tracking service
 */
export interface UsageTracker {
  trackTokenUsage(
    tenantId: string,
    modelId: string,
    tokens: number
  ): Promise<void>;
}

/**
 * Token usage tracker interface
 */
interface TokenUsageTracker {
  trackTokenUsage(tokens: number, operationType: string, modelId: string): void;
}

/**
 * Creates middleware for tenant-aware rate limiting
 */
function createTenantAwareLimiter() {
  return async function tenantAwareLimiter(command: AICommand, next: () => Promise<any>) {
    const tenantContext = getTenantContext();
    if (!tenantContext?.tenantId) {
      throw new Error("No tenant context available");
    }

    // In a real implementation, check tenant limits here
    // For now, we'll just pass through
    return next();
  };
}

/**
 * Creates middleware for context capture
 */
function createContextCaptureMiddleware() {
  return async function contextCaptureMiddleware(command: AICommand, next: () => Promise<any>) {
    // This middleware doesn't need to do anything special
    // as context capture is handled in the command wrapper
    return next();
  };
}

/**
 * Creates middleware for usage tracking
 */
function createUsageTrackingMiddleware(usageTracker: UsageTracker) {
  return async function usageTrackingMiddleware(command: AICommand, next: () => Promise<any>) {
    // Estimate tokens before execution
    const estimatedTokens = estimateCommandTokens(command);
    
    // Execute the command
    const result = await next();
    
    // Track actual token usage after execution if available
    if (result && result.metadata && result.metadata.totalTokens) {
      trackTokenUsage(
        result.metadata.totalTokens,
        command.type,
        command.analysisParameters?.model || 'default'
      );
    } else {
      // Otherwise use estimate
      trackTokenUsage(
        estimatedTokens,
        command.type,
        command.analysisParameters?.model || 'default'
      );
    }
    
    return result;
  };
}

/**
 * AI Command Registry extends the base Command Registry with AI capabilities
 */
export class AICommandRegistry extends CommandRegistry {
  private contextProvider: ContextProvider;
  private aiService: AIService;
  private usageTracker: UsageTracker;
  
  constructor(
    aiService: AIService,
    contextProvider: ContextProvider,
    usageTracker: UsageTracker
  ) {
    super();
    this.aiService = aiService;
    this.contextProvider = contextProvider;
    this.usageTracker = usageTracker;
  }
  
  /**
   * Register an AI command handler with the registry
   */
  async registerAICommand<T extends AICommand, E>(
    type: string,
    handler: AICommandHandler<T, E>,
    options: AICommandOptions = {}
  ): Promise<void> {
    // Register with special AI-specific middleware
    this.middleware.push(
      createTenantAwareLimiter(),
      createContextCaptureMiddleware(),
      createUsageTrackingMiddleware(this.usageTracker)
    );
    
    // Register the command handler with AI support
    return super.register(type, this.wrapWithAICapabilities(handler), options);
  }
  
  /**
   * Wrap an AI command handler with context capture and AI analysis capabilities
   */
  private wrapWithAICapabilities<T extends AICommand, E>(
    handler: AICommandHandler<T, E>
  ): CommandHandler<T, E> {
    return async (command: T): Promise<E> => {
      // Ensure we have tenant context
      const tenantContext = getTenantContext();
      if (!tenantContext?.tenantId) {
        throw new Error("No tenant context available for AI command execution");
      }
      
      // Capture context based on command parameters
      const context = await this.contextProvider.getContext(
        command.documentId,
        command.contextParameters
      );
      
      // Add tenant context to document context
      context.tenantContext = tenantContext;
      
      // Execute AI analysis if needed
      if (command.requiresAIAnalysis) {
        try {
          const analysis = await this.aiService.analyze(context, command.analysisParameters);
          return handler(command, context, analysis);
        } catch (error) {
          console.error(`AI analysis failed for command type ${command.type}:`, error);
          throw new Error(`AI analysis failed: ${(error as Error).message}`);
        }
      }
      
      // Execute without analysis for simpler commands
      return handler(command, context);
    };
  }
}

/**
 * Registry for AI commands
 */
export class AICommandRegistry {
  private handlers: Map<string, AICommandHandler<any, any>> = new Map();
  private validators: Map<string, AICommandValidator<any>> = new Map();
  private options: Map<string, AICommandRegistrationOptions> = new Map();
  
  /**
   * Create a new AI command registry
   */
  constructor(
    private aiService: AIService,
    private contextProvider: ContextProvider,
    private tokenUsageTracker: TokenUsageTracker
  ) {}
  
  /**
   * Register a command handler
   */
  async register<T extends AICommand, R = any>(
    commandType: string,
    handler: AICommandHandler<T, R>,
    options: AICommandRegistrationOptions = {}
  ): Promise<void> {
    if (this.handlers.has(commandType)) {
      throw new Error(`Command handler for ${commandType} already registered`);
    }
    
    this.handlers.set(commandType, handler);
    
    if (options.validator) {
      this.validators.set(commandType, options.validator);
    }
    
    this.options.set(commandType, options);
  }
  
  /**
   * Register an AI command handler
   */
  async registerAICommand<T extends AICommand, R = any>(
    commandType: string,
    handler: AICommandHandler<T, R>,
    options: AICommandRegistrationOptions = {}
  ): Promise<void> {
    await this.register(commandType, this.wrapAIHandler(handler), options);
  }
  
  /**
   * Execute a command
   */
  async execute<T extends AICommand, R = any>(command: T): Promise<R> {
    const commandType = command.type;
    
    // Get handler and options
    const handler = this.handlers.get(commandType);
    if (!handler) {
      throw new Error(`No handler registered for command type ${commandType}`);
    }
    
    const options = this.options.get(commandType) || {};
    const validator = this.validators.get(commandType);
    
    // Validate command if validator exists
    if (validator) {
      const validationResult = await validator(command);
      if (!validationResult.valid) {
        throw new Error(`Command validation failed: ${validationResult.reason}`);
      }
    }
    
    // Get context
    const context = await this.contextProvider.getContext(command.documentId, command.contextParameters);
    
    // AI analysis not needed or not requested, execute directly
    if (!command.requiresAIAnalysis) {
      return handler(command, context);
    }
    
    // Perform AI analysis
    if (!command.analysisParameters) {
      throw new Error('Analysis parameters are required for AI commands');
    }
    
    // Execute with AI analysis
    const analysis = await this.aiService.analyze(context, command.analysisParameters);
    
    // Track token usage if enabled
    if (options.usageTracking && analysis.totalTokens && analysis.totalTokens > 0) {
      this.tokenUsageTracker.trackTokenUsage(
        analysis.totalTokens,
        command.analysisParameters.type,
        analysis.modelId
      );
    }
    
    // Execute handler with analysis result
    return handler(command, context, analysis);
  }
  
  /**
   * Wrap a handler with AI processing
   */
  private wrapAIHandler<T extends AICommand, R = any>(
    handler: AICommandHandler<T, R>
  ): AICommandHandler<T, R> {
    return async (command: T, context: DocumentContext): Promise<R> => {
      if (!command.requiresAIAnalysis) {
        return handler(command, context);
      }
      
      // Command requires AI analysis, but we already performed it in execute
      // This should never happen with proper flow
      throw new Error('AI analysis required but not provided to handler');
    };
  }
  
  /**
   * Get the validator for a command type
   */
  getValidator(commandType: string): AICommandValidator<any> | undefined {
    return this.validators.get(commandType);
  }
  
  /**
   * Check if a command type is registered
   */
  isRegistered(commandType: string): boolean {
    return this.handlers.has(commandType);
  }
}