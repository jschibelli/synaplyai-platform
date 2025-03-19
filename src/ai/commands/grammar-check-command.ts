import { AICommand, AICommandHandler } from '../AICommandRegistry';
import { DocumentContext } from '../ContextProvider';
import { AIAnalysisResult } from '../AICommandRegistry';

/**
 * Command interface for grammar checking
 */
export interface GrammarCheckCommand extends AICommand {
  type: 'GRAMMAR_CHECK';
  documentId: string;
  userId: string;
  selectionStart: number;
  selectionEnd: number;
  contextParameters: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
  };
  analysisParameters: {
    type: 'CHECK_GRAMMAR';
    model?: string;
    temperature?: number;
    maxTokens?: number;
    cache?: boolean;
  };
  requiresAIAnalysis: true;
}

/**
 * Result of grammar check with corrections
 */
export interface GrammarCorrection {
  original: string;
  corrected: string;
  explanation?: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Event for grammar checking
 */
export interface GrammarCheckedEvent {
  documentId: string;
  selectionStart: number;
  selectionEnd: number;
  originalText: string;
  correctedText: string;
  corrections: GrammarCorrection[];
  userId: string;
  aiGenerated: boolean;
  modelId: string;
}

/**
 * Parse corrections from AI analysis result
 */
function parseCorrections(original: string, corrected: string, analysis: AIAnalysisResult): GrammarCorrection[] {
  try {
    // Check if the AI returned structured data
    if (analysis.metadata?.corrections && Array.isArray(analysis.metadata.corrections)) {
      return analysis.metadata.corrections;
    }
    
    // If no structured data, try to extract corrections by comparing texts
    const corrections: GrammarCorrection[] = [];
    
    // Simple diff algorithm to find major differences
    // In production, use a proper diff library
    let i = 0;
    let j = 0;
    let startOffset = -1;
    
    while (i < original.length || j < corrected.length) {
      if (i < original.length && j < corrected.length && original[i] === corrected[j]) {
        // Characters match, move pointers
        if (startOffset !== -1) {
          // End of a difference
          corrections.push({
            original: original.substring(startOffset, i),
            corrected: corrected.substring(startOffset, j),
            startOffset,
            endOffset: i
          });
          startOffset = -1;
        }
        i++;
        j++;
      } else {
        // Characters differ
        if (startOffset === -1) {
          // Start of a difference
          startOffset = i;
        }
        
        // Try to find next matching point
        let nextMatch = -1;
        for (let k = 1; k < 20; k++) {
          if (i + k < original.length && j + k < corrected.length && 
              original[i + k] === corrected[j + k]) {
            nextMatch = k;
            break;
          }
        }
        
        if (nextMatch !== -1) {
          i += nextMatch;
          j += nextMatch;
        } else {
          // Move forward one character
          i++;
          j++;
        }
      }
    }
    
    // Add final correction if any
    if (startOffset !== -1) {
      corrections.push({
        original: original.substring(startOffset),
        corrected: corrected.substring(startOffset),
        startOffset,
        endOffset: original.length
      });
    }
    
    return corrections;
  } catch (error) {
    console.error('Error parsing grammar corrections:', error);
    return [];
  }
}

/**
 * Handler for grammar check command
 */
export function createGrammarCheckHandler(commandRegistry: any): AICommandHandler<GrammarCheckCommand, GrammarCheckedEvent> {
  return async (command: GrammarCheckCommand, context: DocumentContext, analysis?: AIAnalysisResult): Promise<GrammarCheckedEvent> {
    if (!analysis) {
      throw new Error('AI analysis is required for grammar checking');
    }
    
    // Get the original text that was selected
    const originalText = context.selectedText || '';
    
    if (!originalText) {
      throw new Error('No text selected for grammar checking');
    }
    
    // Extract the corrected text from the analysis
    const correctedText = analysis.content;
    
    // Parse corrections from the analysis result
    const corrections = parseCorrections(originalText, correctedText, analysis);
    
    // Create a standard replace text command
    const replaceCommand = {
      type: 'REPLACE_TEXT',
      documentId: command.documentId,
      startPosition: command.selectionStart,
      endPosition: command.selectionEnd,
      newText: correctedText,
      userId: command.userId
    };
    
    // Execute the standard command
    await commandRegistry.execute(replaceCommand);
    
    // Return grammar checked event
    return {
      documentId: command.documentId,
      selectionStart: command.selectionStart,
      selectionEnd: command.selectionEnd,
      originalText,
      correctedText,
      corrections,
      userId: command.userId,
      aiGenerated: true,
      modelId: analysis.modelId
    };
  };
}