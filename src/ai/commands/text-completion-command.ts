import { AICommand, AICommandHandler } from '../AICommandRegistry';
import { DocumentContext } from '../ContextProvider';
import { AIAnalysisResult } from '../AICommandRegistry';

/**
 * Command interface for text completion
 */
export interface CompleteTextCommand extends AICommand {
  type: 'COMPLETE_TEXT';
  documentId: string;
  userId: string;
  position: number;
  prompt: string;
  contextParameters: {
    windowSize: number;
    includePreceding: true;
    includeFollowing: false;
  };
  analysisParameters: {
    type: 'COMPLETE_TEXT';
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  requiresAIAnalysis: true;
}

/**
 * Event for text completion
 */
export interface TextCompletedEvent {
  documentId: string;
  position: number;
  text: string;
  userId: string;
  aiGenerated: boolean;
  modelId: string;
  prompt: string;
}

/**
 * Handler for text completion command
 */
export function createTextCompletionHandler(commandRegistry: any): AICommandHandler<CompleteTextCommand, TextCompletedEvent> {
  return async (command: CompleteTextCommand, context: DocumentContext, analysis?: AIAnalysisResult): Promise<TextCompletedEvent> => {
    if (!analysis) {
      throw new Error('AI analysis is required for text completion');
    }
    
    // Extract the generated text from the analysis
    const generatedText = analysis.content;
    
    // Create a standard insert text command
    const insertCommand = {
      type: 'INSERT_TEXT',
      documentId: command.documentId,
      position: command.position,
      text: generatedText,
      userId: command.userId
    };
    
    // Execute the standard command
    const result = await commandRegistry.execute(insertCommand);
    
    // Return text completed event
    return {
      documentId: command.documentId,
      position: command.position,
      text: generatedText,
      userId: command.userId,
      aiGenerated: true,
      modelId: analysis.modelId,
      prompt: command.prompt
    };
  };
}