import { AICommandRegistry } from '../../../src/ai/AICommandRegistry';
import { registerAICommands } from '../../../src/ai/commands/register-ai-commands';
import { createTextCompletionHandler } from '../../../src/ai/commands/text-completion-command';
import { createTextRewriteHandler } from '../../../src/ai/commands/text-rewrite-command';
import { createGrammarCheckHandler } from '../../../src/ai/commands/grammar-check-command';
import { ContextProvider } from '../../../src/ai/ContextProvider';
import { AIService } from '../../../src/ai/AIService';
import { getTenantContext } from '../../../src/lib/tenant-context';

// Mock dependencies
jest.mock('../../../src/ai/AICommandRegistry');
jest.mock('../../../src/ai/commands/text-completion-command');
jest.mock('../../../src/ai/commands/text-rewrite-command');
jest.mock('../../../src/ai/commands/grammar-check-command');
jest.mock('../../../src/ai/ContextProvider');
jest.mock('../../../src/ai/AIService');
jest.mock('../../../src/lib/tenant-context');

// Mock function implementations
const mockRegisterAICommand = jest.fn().mockResolvedValue(undefined);
const mockExecute = jest.fn().mockResolvedValue({ success: true });
const mockGetContext = jest.fn();
const mockAnalyze = jest.fn();

describe('AI Commands', () => {
  let aiCommandRegistry: jest.Mocked<AICommandRegistry>;
  let contextProvider: jest.Mocked<ContextProvider>;
  let aiService: jest.Mocked<AIService>;
  
  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock tenant context
    (getTenantContext as jest.Mock).mockReturnValue({
      tenantId: 'test-tenant',
      userId: 'test-user'
    });
    
    // Set up mocked AICommandRegistry
    aiCommandRegistry = {
      registerAICommand: mockRegisterAICommand,
      execute: mockExecute,
    } as unknown as jest.Mocked<AICommandRegistry>;
    
    // Set up mocked ContextProvider
    contextProvider = {
      getContext: mockGetContext.mockResolvedValue({
        precedingText: 'This is some text before the cursor.',
        followingText: 'This is some text after the cursor.',
        selectedText: 'This is selected text.',
        tenantContext: { tenantId: 'test-tenant', userId: 'test-user' }
      })
    } as unknown as jest.Mocked<ContextProvider>;
    
    // Set up mocked AIService
    aiService = {
      analyze: mockAnalyze.mockResolvedValue({
        content: 'AI generated content',
        modelId: 'gpt-4',
        totalTokens: 150,
        promptTokens: 100,
        completionTokens: 50
      })
    } as unknown as jest.Mocked<AIService>;
    
    // Mock the handler creators
    (createTextCompletionHandler as jest.Mock).mockReturnValue(jest.fn());
    (createTextRewriteHandler as jest.Mock).mockReturnValue(jest.fn());
    (createGrammarCheckHandler as jest.Mock).mockReturnValue(jest.fn());
  });
  
  describe('registerAICommands', () => {
    test('should register all AI commands with registry', async () => {
      // Execute the registration function
      await registerAICommands(aiCommandRegistry);
      
      // Verify all commands were registered
      expect(mockRegisterAICommand).toHaveBeenCalledTimes(3);
      
      // Verify command types
      expect(mockRegisterAICommand).toHaveBeenCalledWith(
        'COMPLETE_TEXT',
        expect.any(Function),
        expect.objectContaining({
          validator: expect.any(Function),
          usageTracking: true,
          circuitBreaker: true,
          tenantIsolation: true
        })
      );
      
      expect(mockRegisterAICommand).toHaveBeenCalledWith(
        'REWRITE_TEXT',
        expect.any(Function),
        expect.objectContaining({
          validator: expect.any(Function),
          usageTracking: true,
          circuitBreaker: true,
          tenantIsolation: true
        })
      );
      
      expect(mockRegisterAICommand).toHaveBeenCalledWith(
        'GRAMMAR_CHECK',
        expect.any(Function),
        expect.objectContaining({
          validator: expect.any(Function),
          usageTracking: true,
          circuitBreaker: true,
          tenantIsolation: true
        })
      );
    });
  });
  
  describe('Text Completion Command', () => {
    test('should validate text completion command correctly', async () => {
      // Get the validator for COMPLETE_TEXT
      await registerAICommands(aiCommandRegistry);
      const validatorCall = mockRegisterAICommand.mock.calls.find(
        call => call[0] === 'COMPLETE_TEXT'
      );
      const validator = validatorCall[2].validator;
      
      // Valid command
      const validCommand = {
        type: 'COMPLETE_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        position: 10,
        requiresAIAnalysis: true
      };
      
      // Invalid commands
      const noDocId = { ...validCommand, documentId: undefined };
      const noUserId = { ...validCommand, userId: undefined };
      const noPosition = { ...validCommand, position: undefined };
      
      // Test validation results
      expect(await validator(validCommand)).toEqual({ valid: true });
      expect(await validator(noDocId)).toEqual({ valid: false, reason: 'Document ID is required' });
      expect(await validator(noUserId)).toEqual({ valid: false, reason: 'User ID is required' });
      expect(await validator(noPosition)).toEqual({ valid: false, reason: 'Position is required' });
    });
    
    test('should create text completion handler with command registry', () => {
      // Execute registration function
      registerAICommands(aiCommandRegistry);
      
      // Verify handler creator was called with command registry
      expect(createTextCompletionHandler).toHaveBeenCalledWith(aiCommandRegistry);
    });
    
    test('should execute text completion command correctly', async () => {
      // Create a mock handler that simulates text completion
      const mockCompletionHandler = jest.fn().mockImplementation(async (command, context, analysis) => {
        return {
          documentId: command.documentId,
          position: command.position,
          text: analysis.content,
          userId: command.userId,
          aiGenerated: true,
          modelId: analysis.modelId,
          prompt: command.prompt
        };
      });
      
      // Override the mock to return our implementation
      (createTextCompletionHandler as jest.Mock).mockReturnValue(mockCompletionHandler);
      
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Get the handler from the registration call
      const handlerCall = mockRegisterAICommand.mock.calls.find(
        call => call[0] === 'COMPLETE_TEXT'
      );
      const handler = handlerCall[1];
      
      // Create a test command
      const command = {
        type: 'COMPLETE_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        position: 10,
        prompt: 'Complete this text',
        requiresAIAnalysis: true
      };
      
      // Create context and analysis
      const context = {
        precedingText: 'This is the text before the cursor',
        tenantContext: { tenantId: 'test-tenant', userId: 'test-user' }
      };
      
      const analysis = {
        content: 'AI generated completion',
        modelId: 'gpt-4',
        totalTokens: 150
      };
      
      // Execute handler
      const result = await handler(command, context, analysis);
      
      // Verify handler was called with correct arguments
      expect(mockCompletionHandler).toHaveBeenCalledWith(command, context, analysis);
      
      // Verify result
      expect(result).toEqual({
        documentId: 'doc-1',
        position: 10,
        text: 'AI generated completion',
        userId: 'user-1',
        aiGenerated: true,
        modelId: 'gpt-4',
        prompt: 'Complete this text'
      });
    });
  });
  
  describe('Text Rewrite Command', () => {
    test('should validate text rewrite command correctly', async () => {
      // Register commands to capture validator
      await registerAICommands(aiCommandRegistry);
      
      // Get the validation function that was passed to the registry
      const validatorCall = mockRegisterAICommand.mock.calls.find(
        call => call[0] === 'REWRITE_TEXT'
      );
      
      const validateFunc = validatorCall[2].validator;
      
      // Valid command
      const validCommand = {
        type: 'REWRITE_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 10,
        selectionEnd: 20,
        instructions: 'Make this more concise',
        requiresAIAnalysis: true
      };
      
      // Call the validator directly
      const validResult = await validateFunc(validCommand);
      expect(validResult).toEqual({ valid: true });
      
      // Test invalid cases
      const noInstructions = { ...validCommand, instructions: '' };
      const invalidRange = { ...validCommand, selectionStart: 20, selectionEnd: 10 };
      
      const noInstructionsResult = await validateFunc(noInstructions);
      const invalidRangeResult = await validateFunc(invalidRange);
      
      expect(noInstructionsResult.valid).toBe(false);
      expect(invalidRangeResult.valid).toBe(false);
    });
    
    test('should execute text rewrite command correctly', async () => {
      // Create mock handler implementation
      const mockRewriteHandler = jest.fn().mockImplementation(async (command, context, analysis) => {
        return {
          documentId: command.documentId,
          selectionStart: command.selectionStart,
          selectionEnd: command.selectionEnd,
          originalText: context.selectedText || '',
          newText: analysis.content,
          userId: command.userId,
          aiGenerated: true,
          modelId: analysis.modelId,
          instructions: command.instructions
        };
      });
      
      // Override the mock to return our implementation
      (createTextRewriteHandler as jest.Mock).mockReturnValue(mockRewriteHandler);
      
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Get handler from registration call
      const handlerCall = mockRegisterAICommand.mock.calls.find(
        call => call[0] === 'REWRITE_TEXT'
      );
      const handler = handlerCall[1];
      
      // Create test command
      const command = {
        type: 'REWRITE_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 10,
        selectionEnd: 20,
        instructions: 'Make this more concise',
        requiresAIAnalysis: true
      };
      
      // Create context and analysis
      const context = {
        selectedText: 'This is the original selected text',
        tenantContext: { tenantId: 'test-tenant', userId: 'test-user' }
      };
      
      const analysis = {
        content: 'Concise rewritten text',
        modelId: 'gpt-4',
        totalTokens: 120
      };
      
      // Execute handler
      const result = await handler(command, context, analysis);
      
      // Verify handler was called with right arguments
      expect(mockRewriteHandler).toHaveBeenCalledWith(command, context, analysis);
      
      // Verify result
      expect(result).toEqual({
        documentId: 'doc-1',
        selectionStart: 10,
        selectionEnd: 20,
        originalText: 'This is the original selected text',
        newText: 'Concise rewritten text',
        userId: 'user-1',
        aiGenerated: true,
        modelId: 'gpt-4',
        instructions: 'Make this more concise'
      });
    });
  });
  
  describe('Grammar Check Command', () => {
    test('should validate grammar check command correctly', async () => {
      // Register commands to capture validator
      await registerAICommands(aiCommandRegistry);
      
      // Get the validation function that was passed to the registry
      const validatorCall = mockRegisterAICommand.mock.calls.find(
        call => call[0] === 'GRAMMAR_CHECK'
      );
      
      const validator = validatorCall[2].validator;
      
      // Valid command
      const validCommand = {
        type: 'GRAMMAR_CHECK',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 0,
        selectionEnd: 50,
        requiresAIAnalysis: true
      };
      
      // Test valid case
      expect(await validator(validCommand)).toEqual({ valid: true });
      
      // Test invalid cases
      const noDocId = { ...validCommand, documentId: undefined };
      const noUserId = { ...validCommand, userId: undefined };
      const badStart = { ...validCommand, selectionStart: -1 };
      const badEnd = { ...validCommand, selectionEnd: validCommand.selectionStart };
      
      expect((await validator(noDocId)).valid).toBe(false);
      expect((await validator(noUserId)).valid).toBe(false);
      expect((await validator(badStart)).valid).toBe(false);
      expect((await validator(badEnd)).valid).toBe(false);
    });
    
    test('should execute grammar check command correctly', async () => {
      // Create mock handler implementation
      const mockGrammarHandler = jest.fn().mockImplementation(async (command, context, analysis) => {
        // Mock simple grammar correction parsing
        const corrections = [
          {
            original: 'thier',
            corrected: 'their',
            startOffset: 10,
            endOffset: 15,
            explanation: 'Spelling correction'
          }
        ];
        
        return {
          documentId: command.documentId,
          selectionStart: command.selectionStart,
          selectionEnd: command.selectionEnd,
          originalText: context.selectedText || '',
          correctedText: analysis.content,
          corrections,
          userId: command.userId,
          aiGenerated: true,
          modelId: analysis.modelId
        };
      });
      
      // Override the mock to return our implementation
      (createGrammarCheckHandler as jest.Mock).mockReturnValue(mockGrammarHandler);
      
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Get handler from registration call
      const handlerCall = mockRegisterAICommand.mock.calls.find(
        call => call[0] === 'GRAMMAR_CHECK'
      );
      const handler = handlerCall[1];
      
      // Create test command
      const command = {
        type: 'GRAMMAR_CHECK',
        documentId: 'doc-1',
        userId: 'user-1',
        selectionStart: 0,
        selectionEnd: 50,
        requiresAIAnalysis: true
      };
      
      // Create context and analysis
      const context = {
        selectedText: 'This is thier document with some errors.',
        tenantContext: { tenantId: 'test-tenant', userId: 'test-user' }
      };
      
      const analysis = {
        content: 'This is their document with some errors.',
        modelId: 'gpt-4',
        totalTokens: 80
      };
      
      // Execute handler
      const result = await handler(command, context, analysis);
      
      // Verify handler was called with right arguments
      expect(mockGrammarHandler).toHaveBeenCalledWith(command, context, analysis);
      
      // Verify result structure
      expect(result).toMatchObject({
        documentId: 'doc-1',
        selectionStart: 0,
        selectionEnd: 50,
        originalText: 'This is thier document with some errors.',
        correctedText: 'This is their document with some errors.',
        corrections: [expect.objectContaining({ original: 'thier', corrected: 'their' })],
        userId: 'user-1',
        aiGenerated: true,
        modelId: 'gpt-4'
      });
    });
  });
});