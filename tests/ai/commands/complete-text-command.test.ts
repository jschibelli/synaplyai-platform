import { AIService } from '../../../src/services/ai/AIService';
import { DocumentRepository } from '../../../src/repositories/DocumentRepository';
import { CompleteTextCommandHandler } from '../../../src/ai/commands/complete-text-command';
import { createStandardContextParameters } from '../../../src/tests/test-helpers';
import { createTypedMock } from '../../../src/__mocks__/jest-mock-extensions';

describe('Complete Text Command', () => {
  let aiService: { analyze: ReturnType<typeof createTypedMock> };
  let documentRepository: { getDocument: ReturnType<typeof createTypedMock> };
  let handler: CompleteTextCommandHandler;

  beforeEach(() => {
    // Use our typed mocks for proper chaining support
    const aiService = { 
      analyze: createTypedMock().mockResolvedValue({
        content: 'Generated text',
        modelId: 'gpt-4',
        totalTokens: 100,
        promptTokens: 50,
        completionTokens: 50
      }) 
    };

    documentRepository = {
      getDocument: createTypedMock().mockResolvedValue({
        id: 'doc-123',
        content: 'Test document content',
        metadata: {}
      })
    };

    handler = new CompleteTextCommandHandler(aiService as any, documentRepository as any);
  });

  test('should generate text completion', async () => {
    // Create a complete command with ALL required properties
    const command = {
      type: 'COMMAND_TYPE',
      documentId: 'doc-id',
      userId: 'user-id',
      requiresAIAnalysis: true,
      contextParameters: createStandardContextParameters(),
      analysisParameters: { type: 'COMMAND_TYPE' }
    };

    const context = {
      tenantId: 'tenant-abc',
      documentId: 'doc-123',
      precedingText: 'This is',
      followingText: ' a test document'
    };

    const result = await handler.execute(command, context);

    expect(result.content).toBe('Generated completion');
    expect(aiService.analyze).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'COMPLETE_TEXT'
      }),
      expect.anything()
    );
  });
});