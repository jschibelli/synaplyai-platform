import { AICommandRegistry } from '../AICommandRegistry';
import { createTextCompletionHandler } from './text-completion-command';
import { createTextRewriteHandler, validateTextRewriteCommand } from './text-rewrite-command';
import { createGrammarCheckHandler } from './grammar-check-command';
import { SemanticRewriteCommandHandler } from './advanced/semantic-rewrite-command';

/**
 * Register all AI commands with the registry
 */
export async function registerAICommands(aiCommandRegistry: AICommandRegistry): Promise<void> {
  // Register text completion command
  await aiCommandRegistry.registerAICommand(
    'COMPLETE_TEXT',
    createTextCompletionHandler(aiCommandRegistry),
    {
      validator: async (command) => {
        if (!command.documentId) {
          return { valid: false, reason: 'Document ID is required' };
        }
        if (!command.userId) {
          return { valid: false, reason: 'User ID is required' };
        }
        if (typeof command.position !== 'number') {
          return { valid: false, reason: 'Position is required' };
        }
        return { valid: true };
      },
      usageTracking: true,
      circuitBreaker: true,
      tenantIsolation: true
    }
  );
  
  // Register text rewrite command
  await aiCommandRegistry.registerAICommand(
    'REWRITE_TEXT',
    createTextRewriteHandler(aiCommandRegistry),
    {
      validator: validateTextRewriteCommand,
      usageTracking: true,
      circuitBreaker: true,
      tenantIsolation: true
    }
  );
  
  // Register grammar check command
  await aiCommandRegistry.registerAICommand(
    'GRAMMAR_CHECK',
    createGrammarCheckHandler(aiCommandRegistry),
    {
      validator: async (command) => {
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
        return { valid: true };
      },
      usageTracking: true,
      circuitBreaker: true,
      tenantIsolation: true
    }
  );

  // Register semantic rewrite command
  await aiCommandRegistry.registerAICommand(
    'SEMANTIC_REWRITE',
    new SemanticRewriteCommandHandler(aiService, documentContext),
    {
      validator: async (command) => {
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
          return { valid: false, reason: 'Selection end must be greater than start' };
        }
        if (!command.intent) {
          return { valid: false, reason: 'Intent configuration is required' };
        }
        if (command.intent.tone && !['formal', 'casual', 'technical'].includes(command.intent.tone)) {
          return { valid: false, reason: 'Invalid tone specified' };
        }
        return { valid: true };
      },
      usageTracking: true,
      circuitBreaker: true,
      tenantIsolation: true
    }
  );
  
  console.log('AI commands registered successfully');
}