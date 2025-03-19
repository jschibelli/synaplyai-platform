import { createTextRewriteHandler, RewriteTextCommand, TextRewrittenEvent, validateTextRewriteCommand } from '../../../src/ai/commands/text-rewrite-command';
import { AIAnalysisResult } from '../../../src/ai/AICommandRegistry';
import { DocumentContext } from '../../../src/ai/ContextProvider';
import { getTenantContext } from '../../../src/lib/tenant-context';

// Mock dependencies
jest.mock('../../../src/lib/tenant-context');

describe('Text Rewrite Command', () => {
  // Mock command registry
  const mockCommandRegistry = {
    execute: jest.fn(),
    register: jest.fn()
  };
  
  // Create handler
  const textRewriteHandler = createTextRewriteHandler(mockCommandRegistry);
  
  // Test data
  const testTenantId = 'test-tenant';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';
  
  // Sample command
  const testCommand: RewriteTextCommand = {
    type: 'REWRITE_TEXT',
    documentId: testDocumentId,
    userId: testUserId,
    selectionStart: 50,
    selectionEnd: 100,
    instructions: 'Make this more concise',
    contextParameters: {
      windowSize: 500,
      includePreceding: true,
      includeFollowing: true,
      includeMetadata: true
    },
    analysisParameters: {
      type: 'REWRITE_SELECTION',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 100
    },
    requiresAIAnalysis: true
  };
  
  // Sample context with selected text
  const testContext: DocumentContext = {
    selectedText: 'This is the original text that is somewhat verbose and contains unnecessary words that could be removed to make it more concise and to the point.',
    precedingText: 'Text before selection. ',
    followingText: ' Text after selection.',
    documentMetadata: { id: testDocumentId, title: 'Test Document' },
    tenantContext: { tenantId: testTenantId, userId: testUserId }
  };
  
  // Sample AI analysis result
  const testAnalysis: AIAnalysisResult = {
    content: 'This is the concise version.',
    modelId: 'gpt-4',
    totalTokens: 120,
    promptTokens: 100,
    completionTokens: 20,
    metadata: {
      responseTime: 450,
      operationId: 'test-op-456'
    }
  };
  
  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();
    
    // Default mock implementations
    mockCommandRegistry.execute.mockResolvedValue({ success: true });
    
    // Set up tenant context mock
    (getTenantContext as jest.Mock).mockReturnValue({
      tenantId: testTenantId,
      userId: testUserId
    });
  });
  
  describe('Command Validation', () => {
    test('should validate command with all required fields', () => {
      const validationResult = validateTextRewriteCommand(testCommand);
      expect(validationResult.valid).toBe(true);
    });
    
    test('should reject command without document ID', () => {
      const invalidCommand = { ...testCommand, documentId: undefined };
      const validationResult = validateTextRewriteCommand(invalidCommand as any);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.reason).toContain('Document ID is required');
    });
    
    test('should reject command without user ID', () => {
      const invalidCommand = { ...testCommand, userId: undefined };
      const validationResult = validateTextRewriteCommand(invalidCommand as any);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.reason).toContain('User ID is required');
    });
    
    test('should reject command with invalid selection range', () => {
      const invalidCommand = { 
        ...testCommand, 
        selectionStart: 100, 
        selectionEnd: 50 
      };
      
      const validationResult = validateTextRewriteCommand(invalidCommand);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.reason).toContain('Selection end must be greater than selection start');
    });
    
    test('should reject command without rewrite instructions', () => {
      const invalidCommand = { ...testCommand, instructions: '' };
      const validationResult = validateTextRewriteCommand(invalidCommand);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.reason).toContain('Rewrite instructions are required');
    });
  });
  
  describe('Command Execution', () => {
    test('should require AI analysis result', async () => {
      // Call handler without analysis result
      await expect(textRewriteHandler(testCommand, testContext, undefined))
        .rejects
        .toThrow('AI analysis is required for text rewriting');
      
      // Verify no command was executed
      expect(mockCommandRegistry.execute).not.toHaveBeenCalled();
    });
    
    test('should require selected text', async () => {
      // Context without selected text
      const contextWithoutSelection = { ...testContext, selectedText: undefined };
      
      // Call handler without selected text
      await expect(textRewriteHandler(testCommand, contextWithoutSelection, testAnalysis))
        .rejects
        .toThrow('No text selected for rewriting');
      
      // Verify no command was executed
      expect(mockCommandRegistry.execute).not.toHaveBeenCalled();
    });
    
    test('should create a REPLACE_TEXT command from AI rewrite', async () => {
      // Execute handler
      await textRewriteHandler(testCommand, testContext, testAnalysis);
      
      // Verify REPLACE_TEXT command was executed with correct parameters
      expect(mockCommandRegistry.execute).toHaveBeenCalledWith({
        type: 'REPLACE_TEXT',
        documentId: testDocumentId,
        startPosition: testCommand.selectionStart,
        endPosition: testCommand.selectionEnd,
        newText: testAnalysis.content,
        userId: testUserId
      });
    });
    
    test('should return TextRewrittenEvent with AI metadata', async () => {
      // Mock command registry execute response
      mockCommandRegistry.execute.mockResolvedValue({
        documentId: testDocumentId,
        startPosition: testCommand.selectionStart,
        endPosition: testCommand.selectionEnd,
        replacedText: testContext.selectedText
      });
      
      // Execute handler
      const result = await textRewriteHandler(testCommand, testContext, testAnalysis);
      
      // Verify event structure
      expect(result).toMatchObject({
        documentId: testDocumentId,
        selectionStart: testCommand.selectionStart,
        selectionEnd: testCommand.selectionEnd,
        originalText: testContext.selectedText,
        newText: testAnalysis.content,
        userId: testUserId,
        aiGenerated: true,
        modelId: testAnalysis.modelId,
        instructions: testCommand.instructions
      });
    });
    
    test('should propagate errors from command execution', async () => {
      // Mock command registry error
      const testError = new Error('Selection out of range');
      mockCommandRegistry.execute.mockRejectedValue(testError);
      
      // Execute handler and expect error
      await expect(textRewriteHandler(testCommand, testContext, testAnalysis))
        .rejects
        .toThrow('Selection out of range');
    });
  });
});