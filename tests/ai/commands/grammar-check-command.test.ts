import { createGrammarCheckHandler, GrammarCheckCommand, GrammarCheckedEvent } from '../../../src/ai/commands/grammar-check-command';
import { AIAnalysisResult } from '../../../src/ai/AICommandRegistry';
import { DocumentContext } from '../../../src/ai/ContextProvider';
import { getTenantContext } from '../../../src/lib/tenant-context';

// Mock dependencies
jest.mock('../../../src/lib/tenant-context');

describe('Grammar Check Command', () => {
  // Mock command registry
  const mockCommandRegistry = {
    execute: jest.fn(),
    register: jest.fn()
  };
  
  // Create handler
  const grammarCheckHandler = createGrammarCheckHandler(mockCommandRegistry);
  
  // Test data
  const testTenantId = 'test-tenant';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';
  
  // Sample command
  const testCommand: GrammarCheckCommand = {
    type: 'GRAMMAR_CHECK',
    documentId: testDocumentId,
    userId: testUserId,
    selectionStart: 20,
    selectionEnd: 120,
    contextParameters: {
      windowSize: 500,
      includePreceding: true,
      includeFollowing: true
    },
    analysisParameters: {
      type: 'CHECK_GRAMMAR',
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      maxTokens: 100,
      cache: true
    },
    requiresAIAnalysis: true
  };
  
  // Sample context with text containing grammar errors
  const testContext: DocumentContext = {
    selectedText: 'This sentense has several errors in it. There are two speling mistakes. The punctuation is also wrong',
    precedingText: 'Text before selection. ',
    followingText: ' Text after selection.',
    documentMetadata: { id: testDocumentId, title: 'Test Document' },
    tenantContext: { tenantId: testTenantId, userId: testUserId }
  };
  
  // Sample AI analysis result with corrected text
  const testAnalysis: AIAnalysisResult = {
    content: 'This sentence has several errors in it. There are two spelling mistakes. The punctuation is also wrong.',
    modelId: 'gpt-3.5-turbo',
    totalTokens: 80,
    promptTokens: 60,
    completionTokens: 20,
    metadata: {
      responseTime: 320,
      operationId: 'test-op-789',
      corrections: [
        {
          original: 'sentense',
          corrected: 'sentence',
          explanation: 'Spelling correction',
          startOffset: 5,
          endOffset: 13
        },
        {
          original: 'speling',
          corrected: 'spelling',
          explanation: 'Spelling correction',
          startOffset: 51,
          endOffset: 58
        },
        {
          original: 'wrong',
          corrected: 'wrong.',
          explanation: 'Added missing period',
          startOffset: 93,
          endOffset: 98
        }
      ]
    }
  };
  
  // Analysis without structured corrections
  const testAnalysisWithoutCorrections: AIAnalysisResult = {
    content: 'This sentence has several errors in it. There are two spelling mistakes. The punctuation is also wrong.',
    modelId: 'gpt-3.5-turbo',
    totalTokens: 80,
    promptTokens: 60,
    completionTokens: 20,
    metadata: {
      responseTime: 320,
      operationId: 'test-op-789'
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
  
  test('should require AI analysis result', async () => {
    // Call handler without analysis result
    await expect(grammarCheckHandler(testCommand, testContext, undefined))
      .rejects
      .toThrow('AI analysis is required for grammar checking');
    
    // Verify no command was executed
    expect(mockCommandRegistry.execute).not.toHaveBeenCalled();
  });
  
  test('should require selected text', async () => {
    // Context without selected text
    const contextWithoutSelection = { ...testContext, selectedText: undefined };
    
    // Call handler without selected text
    await expect(grammarCheckHandler(testCommand, contextWithoutSelection, testAnalysis))
      .rejects
      .toThrow('No text selected for grammar checking');
    
    // Verify no command was executed
    expect(mockCommandRegistry.execute).not.toHaveBeenCalled();
  });
  
  test('should create a REPLACE_TEXT command with corrected text', async () => {
    // Execute handler
    await grammarCheckHandler(testCommand, testContext, testAnalysis);
    
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
  
  test('should return GrammarCheckedEvent with AI metadata and corrections', async () => {
    // Execute handler
    const result = await grammarCheckHandler(testCommand, testContext, testAnalysis);
    
    // Verify event structure
    expect(result).toMatchObject({
      documentId: testDocumentId,
      selectionStart: testCommand.selectionStart,
      selectionEnd: testCommand.selectionEnd,
      originalText: testContext.selectedText,
      correctedText: testAnalysis.content,
      userId: testUserId,
      aiGenerated: true,
      modelId: testAnalysis.modelId
    });
    
    // Verify corrections were included
    expect(result.corrections).toBeDefined();
    expect(result.corrections.length).toBe(3);
    expect(result.corrections[0]).toMatchObject({
      original: 'sentense',
      corrected: 'sentence'
    });
  });
  
  test('should extract corrections even when not provided by AI', async () => {
    // Execute handler with analysis without structured corrections
    const result = await grammarCheckHandler(testCommand, testContext, testAnalysisWithoutCorrections);
    
    // Verify corrections were parsed
    expect(result.corrections).toBeDefined();
    expect(result.corrections.length).toBeGreaterThan(0);
  });
  
  test('should handle identical text with no corrections needed', async () => {
    // Context with already correct text
    const correctContext = {
      ...testContext,
      selectedText: 'This sentence is already correct.'
    };
    
    // Analysis returning the same text
    const identicalAnalysis = {
      ...testAnalysis,
      content: 'This sentence is already correct.'
    };
    
    // Execute handler
    const result = await grammarCheckHandler(testCommand, correctContext, identicalAnalysis);
    
    // Verify no corrections were found
    expect(result.corrections).toEqual([]);
  });
  
  test('should propagate errors from command execution', async () => {
    // Mock command registry error
    const testError = new Error('Selection out of range');
    mockCommandRegistry.execute.mockRejectedValue(testError);
    
    // Execute handler and expect error
    await expect(grammarCheckHandler(testCommand, testContext, testAnalysis))
      .rejects
      .toThrow('Selection out of range');
  });
});