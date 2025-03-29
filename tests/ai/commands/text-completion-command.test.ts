import { createTextCompletionHandler } from '../../../src/ai/commands/text-completion-command';
import { AIAnalysisResult, DocumentContext } from '../../../src/tests/test-interfaces';
import { getTenantContext } from '../../../src/lib/tenant-context';
import { createCompleteTextCommand } from '../../../src/tests/test-helpers';

// Mock dependencies
jest.mock('../../../src/lib/tenant-context');

describe('Text Completion Command', () => {
  // Mock command registry
  const mockCommandRegistry = {
    execute: jest.fn(),
    register: jest.fn()
  };
  
  // Create handler
  const textCompletionHandler = createTextCompletionHandler(mockCommandRegistry);
  
  // Test data
  const testTenantId = 'test-tenant';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';
  
  // Sample command
  const testCommand = createCompleteTextCommand({
    documentId: 'doc-1',
    userId: 'user-1',
    position: 0,
    prompt: 'Complete this text',
    contextParameters: {
      windowSize: 100,
      includePreceding: true,
      includeFollowing: false,
      includeDocument: true
    }
  });
  
  // Sample context
  const testContext: DocumentContext = {
    precedingText: 'This is text before the cursor. The document discusses',
    documentMetadata: { id: testDocumentId },
    tenantContext: { tenantId: testTenantId, userId: testUserId },
    aiAnalysisResult: {
      content: 'important architectural considerations for system design. The key aspects include scalability, reliability, and performance.',
      modelId: 'gpt-4',
      totalTokens: 150,
      promptTokens: 100,
      completionTokens: 50,
      metadata: {
        responseTime: 500,
        operationId: 'test-op-123'
      }
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
    // Create context without AI analysis result
    const contextWithoutAnalysis = {
      ...testContext,
      aiAnalysisResult: undefined
    };
    
    // Test with execute method
    await expect(textCompletionHandler.execute(testCommand, contextWithoutAnalysis))
      .rejects
      .toThrow('AI analysis is required for text completion');
    
    // Verify no command was executed
    expect(mockCommandRegistry.execute).not.toHaveBeenCalled();
  });
  
  test('should create an INSERT_TEXT command from AI completion', async () => {
    // Execute handler
    await textCompletionHandler.execute(testCommand, testContext);
    
    // Verify INSERT_TEXT command was executed with correct parameters
    expect(mockCommandRegistry.execute).toHaveBeenCalledWith({
      type: 'INSERT_TEXT',
      documentId: testDocumentId,
      position: testCommand.position,
      text: testContext.aiAnalysisResult?.content,
      userId: testUserId
    });
  });
  
  test('should return TextCompletedEvent with AI metadata', async () => {
    // Mock command registry execute response
    mockCommandRegistry.execute.mockResolvedValue({
      documentId: testDocumentId,
      position: 100,
      insertedText: testContext.aiAnalysisResult?.content
    });
    
    // Execute handler
    const result = await textCompletionHandler.execute(testCommand, testContext);
    
    // Verify event structure
    expect(result).toMatchObject({
      documentId: testDocumentId,
      position: testCommand.position,
      text: testContext.aiAnalysisResult?.content,
      userId: testUserId,
      aiGenerated: true,
      modelId: testContext.aiAnalysisResult?.modelId,
      prompt: testCommand.prompt
    });
  });
  
  test('should propagate errors from command execution', async () => {
    // Mock command registry error
    const testError = new Error('Document not found');
    mockCommandRegistry.execute.mockRejectedValue(testError);
    
    // Execute handler and expect error
    await expect(textCompletionHandler.execute(testCommand, testContext))
      .rejects
      .toThrow('Document not found');
  });
  
  test('should handle empty AI analysis result gracefully', async () => {
    // Create empty analysis
    const contextWithEmptyAnalysis = {
      ...testContext,
      aiAnalysisResult: {
        ...testContext.aiAnalysisResult!,
        content: ''
      }
    };
    
    // Execute handler
    await textCompletionHandler.execute(testCommand, contextWithEmptyAnalysis);
    
    // Verify INSERT_TEXT command was executed with empty string
    expect(mockCommandRegistry.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        text: ''
      })
    );
  });
  
  test('should use provided context for metadata', async () => {
    // Context with additional metadata
    const enrichedContext = {
      ...testContext,
      documentMetadata: {
        ...testContext.documentMetadata,
        title: 'Test Document',
        version: 3
      }
    };
    
    // Execute handler
    await textCompletionHandler.execute(testCommand, enrichedContext);
    
    // Command execution should be the same regardless of context metadata
    expect(mockCommandRegistry.execute).toHaveBeenCalledWith({
      type: 'INSERT_TEXT',
      documentId: testDocumentId,
      position: testCommand.position,
      text: testContext.aiAnalysisResult?.content,
      userId: testUserId
    });
  });
});