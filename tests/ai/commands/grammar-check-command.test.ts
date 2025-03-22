import { GrammarCheckCommand } from '../../../src/ai/AICommandRegistry';
import { DocumentContext } from '../../../src/ai/context/DocumentContext';
import { AIAnalysisResult } from '../../../src/services/ai/AIService';
import { getTenantContext } from '../../../src/lib/tenant-context';

jest.mock('../../../src/lib/tenant-context');

describe('Grammar Check Command', () => {
  const testDocumentId = 'doc-123';
  const testUserId = 'user-456';
  const testTenantId = 'tenant-789';
  
  const mockCommandRegistry = {
    execute: jest.fn().mockResolvedValue({ success: true })
  };
  
  const testCommand: GrammarCheckCommand = {
    type: 'GRAMMAR_CHECK',
    documentId: testDocumentId,
    userId: testUserId,
    selectionStart: 0,
    selectionEnd: 100,
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
    parameters: {
      type: 'CHECK_GRAMMAR',
      model: 'gpt-3.5-turbo',
      temperature: 0.3,
      maxTokens: 100,
      cache: true
    },
    requiresAIAnalysis: true
  };
  
  // Sample context with text containing grammar errors
  const testContext: DocumentContext = new DocumentContext({
    documentId: testDocumentId,
    userId: testUserId,
    selectedText: 'This sentense has several errors in it. There are two speling mistakes. The punctuation is also wrong',
    precedingText: 'Text before selection. ',
    followingText: ' Text after selection.',
    documentMetadata: { title: 'Test Document' },
    tenantContext: { tenantId: testTenantId, userId: testUserId }
  });
  
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
  
  // Grammar check command handler function to test
  const grammarCheckHandler = async (
    command: GrammarCheckCommand,
    context: DocumentContext,
    analysis?: AIAnalysisResult
  ) => {
    if (!analysis) {
      throw new Error('AI analysis is required for grammar checking');
    }
    
    // Extract corrections from AI analysis result
    const corrections = analysis.metadata.corrections || [];
    
    // Return grammar check result
    return {
      documentId: command.documentId,
      selectionStart: command.selectionStart,
      selectionEnd: command.selectionEnd,
      originalText: context.selectedText,
      correctedText: analysis.content,
      corrections,
      userId: command.userId,
      aiGenerated: true,
      modelId: analysis.modelId
    };
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
});