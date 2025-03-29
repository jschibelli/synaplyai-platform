import { AICommandHandler } from '../AICommandRegistry';
import { ConflictResolutionCommand } from './types';
import { ConflictResolutionResult } from '../../collaboration/conflict/types';
import { ConflictDetector } from '../../collaboration/conflict/ConflictDetector';
import { ConflictResolver } from '../../collaboration/conflict/ConflictResolver';

/**
 * AI-assisted conflict resolution command handler
 */
export const conflictResolutionHandler: AICommandHandler<ConflictResolutionCommand, ConflictResolutionResult> = 
  async (command, context, analysis) => {
    // Extract the conflict from context
    const { conflictId } = command;
    const conflict = context.activeConflicts?.find(c => c.id === conflictId);
    
    if (!conflict) {
      throw new Error(`Conflict with ID ${conflictId} not found`);
    }
    
    // Use AI analysis to determine the best resolution strategy
    const aiSuggestion = analysis.recommendation || 'merge';
    
    // Create resolution based on AI suggestion and command parameters
    const resolution = {
      conflictId,
      strategy: command.strategy || aiSuggestion,
      customContent: command.customContent || analysis.content,
      metadata: {
        aiAssisted: true,
        confidence: analysis.confidence || 0.8,
        modelId: analysis.modelId
      }
    };
    
    // Execute the resolution
    const resolver = new ConflictResolver();
    const result = await resolver.resolveConflict(conflict, resolution);
    
    return {
      ...result,
      aiMetadata: {
        assistanceType: 'conflict_resolution',
        confidenceScore: analysis.confidence || 0.8
      }
    };
  };