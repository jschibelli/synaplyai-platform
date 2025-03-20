import { AICommand, AIAnalysisResult } from './AICommandRegistry';
import { ContextProvider, DocumentContext } from './ContextProvider'; // Import DocumentContext from ContextProvider
import { CommandRegistry } from '../commands/CommandRegistry';
import { InsertTextCommand, ReplaceTextCommand, SummarizeSelectionCommand, ImproveWritingCommand } from '../commands/CommandTypes'; // Import missing command types

// Text styling criteria interface
export interface StyleCriteria {
  tone?: 'formal' | 'casual' | 'technical' | 'creative';
  length?: 'concise' | 'detailed' | 'balanced';
  audience?: 'general' | 'expert' | 'beginner';
}

// AI Command Interfaces
export interface CompleteTextCommand extends AICommand {
  position: number;
  prefixLength: number;
  prompt?: string;
  styleCriteria?: StyleCriteria;
  contextParameters?: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
  };
}

export interface RewriteSelectionCommand extends AICommand {
  documentId: string;
  startPosition: number;
  endPosition: number;
  instructions: string;
  userId: string;
}

// Other command interfaces...

export class AICommandHandlers {
  constructor(private commandRegistry: CommandRegistry) {}

  // Complete text handler
  completeTextHandler = async (
    command: CompleteTextCommand, 
    context: DocumentContext, 
    analysis: AIAnalysisResult
  ) => {
    // Use AI analysis to generate appropriate text completion
    const generatedText = analysis.content;
    
    // Create a standard insert text command from AI result
    const insertCommand: InsertTextCommand = {
      type: 'INSERT_TEXT',
      documentId: command.documentId,
      position: command.position,
      text: generatedText,
      userId: command.userId
    };
    
    // Execute the standard command
    const insertResult = await this.commandRegistry.execute(insertCommand.type, insertCommand);
    
    // Return event with AI-specific metadata
    return {
      ...insertResult,
      metadata: {
        ...insertResult.metadata,
        aiGenerated: true,
        prompt: command.prompt,
        modelId: analysis.modelId
      }
    };
  }

  rewriteSelectionHandler = async (
    command: RewriteSelectionCommand, 
    context: DocumentContext, 
    analysis: AIAnalysisResult
  ) => {
    // Use AI to rewrite the selected text
    const rewrittenText = analysis.content;
    
    // Create a replace text command from AI result
    const replaceCommand: ReplaceTextCommand = {
      type: 'REPLACE_TEXT',
      documentId: command.documentId,
      startPosition: command.startPosition,
      endPosition: command.endPosition,
      newText: rewrittenText,
      userId: command.userId
    };
    
    // Execute standard command
    const replaceResult = await this.commandRegistry.execute(replaceCommand.type, replaceCommand);
    
    // Return event with AI-specific metadata
    return {
      ...replaceResult,
      metadata: {
        ...replaceResult.metadata,
        aiGenerated: true,
        instructions: command.instructions,
        modelId: analysis.modelId
      }
    };
  }

  // Summarize selection handler
  summarizeSelectionHandler = async (
    command: SummarizeSelectionCommand, 
    context: DocumentContext, 
    analysis: AIAnalysisResult
  ) => {
    // Create a replace text command with the summarized content
    const replaceCommand: ReplaceTextCommand = {
      type: 'REPLACE_TEXT',
      documentId: command.documentId,
      startPosition: command.startPosition,
      endPosition: command.endPosition,
      newText: analysis.content,
      userId: command.userId
    };
    
    // Execute standard command
    const replaceResult = await this.commandRegistry.execute(replaceCommand.type, replaceCommand);
    
    // Return event with AI-specific metadata
    return {
      ...replaceResult,
      metadata: {
        ...replaceResult.metadata,
        aiGenerated: true,
        summary: true,
        originalLength: command.originalText.length,
        summarizedLength: analysis.content.length,
        format: command.format,
        modelId: analysis.modelId
      }
    };
  }

  // Improve writing handler
  improveWritingHandler = async (
    command: ImproveWritingCommand, 
    context: DocumentContext, 
    analysis: AIAnalysisResult
  ) => {
    // Create a replace text command with the improved content
    const replaceCommand: ReplaceTextCommand = {
      type: 'REPLACE_TEXT',
      documentId: command.documentId,
      startPosition: command.startPosition,
      endPosition: command.endPosition,
      newText: analysis.content,
      userId: command.userId
    };
    
    // Execute standard command
    const replaceResult = await this.commandRegistry.execute(replaceCommand.type, replaceCommand);
    
    // Return event with AI-specific metadata
    return {
      ...replaceResult,
      metadata: {
        ...replaceResult.metadata,
        aiGenerated: true,
        improvedAspects: command.aspects,
        intensity: command.intensity,
        modelId: analysis.modelId
      }
    };
  }
}