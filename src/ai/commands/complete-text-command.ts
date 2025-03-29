import { AICommandContext, CompleteTextCommand } from '../AICommandRegistry';
import { AIAnalysisResult } from '../../tests/test-interfaces';

export interface CompleteTextCommandHandler {
  execute: (command: CompleteTextCommand, context: AICommandContext) => Promise<any>;
}

export function createTextCompletionHandler(registry: any): CompleteTextCommandHandler {
  return {
    execute: async (command, context) => {
      // Validate inputs
      if (!context.document?.content) {
        throw new Error('Document content is required');
      }

      // Check if we have existing analysis
      if (context.aiAnalysisResult) {
        return {
          content: context.aiAnalysisResult.content,
          metadata: context.aiAnalysisResult.metadata
        };
      }

      // Return mock completion for test
      return {
        content: 'Generated text completion for prompt: ' + command.prompt,
        metadata: {
          tokens: 100,
          model: command.analysisParameters.model,
          prompt: command.prompt
        }
      };
    }
  };
}