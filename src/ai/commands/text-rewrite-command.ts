import { AICommand, AICommandHandler } from '../AICommandRegistry';
import { DocumentContext } from '../ContextProvider';
import { AIAnalysisResult } from '../AICommandRegistry';

/**
 * Command interface for text rewriting
 */
export interface RewriteTextCommand extends AICommand {
  type: 'REWRITE_TEXT';
  documentId: string;
  userId: string;
  selectionStart: number;
  selectionEnd: number;
  instructions: string;
  contextParameters: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
    includeMetadata: boolean;
  };
  analysisParameters: {
    type: 'REWRITE_SELECTION';
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };
  requiresAIAnalysis: true;
}

/**
 * Event for text rewriting
 */
export interface TextRewrittenEvent {
  documentId: string;
  selectionStart: number;
  selectionEnd: number;
  originalText: string;
  newText: string;
  userId: string;
  aiGenerated: boolean;
  modelId: string;
  instructions: string;
}

/**
 * Handler for text rewriting command
 */
export function createTextRewriteHandler(commandRegistry: any): AICommandHandler<RewriteTextCommand, TextRewrittenEvent> {
  return async (command: RewriteTextCommand, context: DocumentContext, analysis?: AIAnalysisResult): Promise<TextRewrittenEvent> {
    if (!analysis) {
      throw new Error('AI analysis is required for text rewriting');
    }
    
    // Get the original text that was selected
    const originalText = context.selectedText || '';
    
    if (!originalText) {
      throw new Error('No text selected for rewriting');
    }
    
    // Extract the generated text from the analysis
    const rewrittenText = analysis.content;
    
    // Create a standard replace text command
    const replaceCommand = {
      type: 'REPLACE_TEXT',
      documentId: command.documentId,
      startPosition: command.selectionStart,
      endPosition: command.selectionEnd,
      newText: rewrittenText,
      userId: command.userId
    };
    
    // Execute the standard command
    await commandRegistry.execute(replaceCommand);
    
    // Return text rewritten event
    return {
      documentId: command.documentId,
      selectionStart: command.selectionStart,
      selectionEnd: command.selectionEnd,
      originalText,
      newText: rewrittenText,
      userId: command.userId,
      aiGenerated: true,
      modelId: analysis.modelId,
      instructions: command.instructions
    };
  };
}

/**
 * Validator for text rewriting command
 */
export function validateTextRewriteCommand(command: RewriteTextCommand): { valid: boolean; reason?: string } {
  if (!command.documentId) {
    return { valid: false, reason: 'Document ID is required' };
  }
  
  if (!command.userId) {
    return { valid: false, reason: 'User ID is required' };
  }
  
  if (typeof command.selectionStart !== 'number' || command.selectionStart < 0) {
    return { valid: false, reason: 'Selection start must be a non-negative number' };
  }
  
  if (typeof command.selectionEnd !== 'number' || command.selectionEnd <= command.selectionStart) {
    return { valid: false, reason: 'Selection end must be greater than selection start' };
  }
  
  if (!command.instructions) {
    return { valid: false, reason: 'Rewrite instructions are required' };
  }
  
  return { valid: true };
}