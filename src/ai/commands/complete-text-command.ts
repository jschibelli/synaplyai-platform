import { AICommand, AICommandHandler, AIAnalysisResult } from '../AICommandRegistry';
import { AICommandContext, AICommandContextParameters } from '../AICommandContext';
import { DocumentContext } from '../ContextProvider';

/**
 * Command interface for text completion
 */
export interface CompleteTextCommand extends AICommand {
  type: 'COMPLETE_TEXT' | 'AUTO_DETECT';
  documentId: string;
  userId: string;
  position: number;
  prompt?: string;
  contextParameters: AICommandContextParameters;
  analysisParameters: {
    type: string;
    model: string;
    temperature: number;
    maxTokens: number;
    retryAttempts?: number;
    [key: string]: any;
  };
  requiresAIAnalysis: boolean;
  [key: string]: any;
}

/**
 * Event emitted after text completion
 */
export interface TextCompletedEvent {
  documentId: string;
  position: number;
  text: string;
  userId: string;
  aiGenerated: boolean;
  modelId: string;
  prompt?: string;
  metadata?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    responseTime?: number;
    [key: string]: any;
  };
}

/**
 * Interface for text completion handler
 */
export interface CompleteTextCommandHandler {
  execute: (command: CompleteTextCommand, context: AICommandContext) => Promise<TextCompletedEvent>;
}

/**
 * Creates a handler for text completion commands
 * @param commandRegistry Command registry for executing standard commands
 * @returns Text completion command handler
 */
export function createTextCompletionHandler(commandRegistry: any): CompleteTextCommandHandler {
  return {
    execute: async (command: CompleteTextCommand, context: AICommandContext): Promise<TextCompletedEvent> => {
      // Validate inputs
      if (!command.documentId) {
        throw new Error('Document ID is required');
      }

      if (command.position === undefined || command.position < 0) {
        throw new Error('Valid position is required');
      }

      // Use analysis result if available
      if (context.aiAnalysisResult) {
        // Create an insert text command to apply the completion
        const insertCommand = {
          type: 'INSERT_TEXT',
          documentId: command.documentId,
          position: command.position,
          text: context.aiAnalysisResult.content || '',
          userId: command.userId
        };

        // Execute the insert command
        try {
          const result = await commandRegistry.execute(insertCommand.type, insertCommand);

          // Return event with AI-specific metadata
          return {
            documentId: command.documentId,
            position: command.position,
            text: context.aiAnalysisResult.content || '',
            userId: command.userId,
            aiGenerated: true,
            modelId: context.aiAnalysisResult.modelId || 'unknown',
            prompt: command.prompt,
            metadata: {
              promptTokens: context.aiAnalysisResult.promptTokens,
              completionTokens: context.aiAnalysisResult.completionTokens,
              totalTokens: context.aiAnalysisResult.totalTokens,
              responseTime: context.aiAnalysisResult.metadata?.responseTime
            }
          };
        } catch (error) {
          // Propagate errors for proper handling
          throw error;
        }
      }

      // If no analysis is available, throw an error
      throw new Error('AI analysis is required for text completion');
    }
  };
}

/**
 * Full implementation of CompleteTextCommandHandler with AI service
 */
export class CompleteTextCommandHandler {
  private aiService: any;
  private documentRepository: any;

  /**
   * Create a new text completion handler
   * @param aiService AI service for text generation
   * @param documentRepository Repository for accessing document content
   */
  constructor(aiService: any, documentRepository: any) {
    this.aiService = aiService;
    this.documentRepository = documentRepository;
  }

  /**
   * Execute the command to generate and apply text completion
   * @param command Text completion command
   * @param context Command execution context
   * @returns Text completion result
   */
  async execute(command: CompleteTextCommand, context: AICommandContext | DocumentContext): Promise<any> {
    // Ensure we have a valid context
    const aiContext = 'tenantId' in context ? context : this.convertToAIContext(context, command);
    
    // If analysis result already exists, use it
    if (context.aiAnalysisResult) {
      return {
        content: context.aiAnalysisResult.content,
        metadata: {
          model: context.aiAnalysisResult.modelId,
          tokens: context.aiAnalysisResult.totalTokens,
          promptTokens: context.aiAnalysisResult.promptTokens,
          completionTokens: context.aiAnalysisResult.completionTokens
        }
      };
    }
    
    // Otherwise, analyze to get completion
    try {
      // Load document if needed
      if (!aiContext.document && command.documentId) {
        const document = await this.documentRepository.getDocument(command.documentId);
        aiContext.document = document;
      }
      
      // Prepare analysis parameters
      const analysisParams = {
        type: command.analysisParameters?.type || 'COMPLETE_TEXT',
        prompt: command.prompt,
        model: command.analysisParameters?.model || 'gpt-4',
        temperature: command.analysisParameters?.temperature || 0.7,
        maxTokens: command.analysisParameters?.maxTokens || 100,
        retryAttempts: command.analysisParameters?.retryAttempts,
        position: command.position,
        onToken: aiContext.onToken,
        contextParams: command.contextParameters
      };
      
      // Generate completion
      const analysisResult = await this.aiService.analyze(analysisParams, aiContext);
      
      return {
        content: analysisResult.content,
        metadata: {
          model: analysisResult.modelId,
          tokens: analysisResult.totalTokens,
          promptTokens: analysisResult.promptTokens,
          completionTokens: analysisResult.completionTokens
        }
      };
    } catch (error) {
      console.error('Error in AI text completion:', error);
      throw new Error(`Failed to generate text completion: ${error.message}`);
    }
  }
  
  /**
   * Convert document context to AI command context
   * @param context Document context
   * @param command Command with parameters
   * @returns AI command context
   * @private
   */
  private convertToAIContext(context: any, command: CompleteTextCommand): AICommandContext {
    return {
      documentId: command.documentId,
      userId: command.userId,
      tenantId: context.tenantContext?.tenantId || 'default',
      document: context.document || { content: context.content || '', metadata: context.metadata || {} },
      precedingText: context.precedingText || '',
      followingText: context.followingText || '',
      onProgress: context.onProgress,
      onToken: context.onToken,
      documentMetadata: context.documentMetadata || {}
    };
  }
}