import { AICommandRegistry } from '../ai/AICommandRegistry';
import { CompleteTextCommand } from '../ai/commands/text-completion-command';
import { registerAICommands } from '../ai/commands/register-ai-commands';
import { baseCommandRegistry } from '../commands/CommandRegistry';
import { mockAIProvider } from '../ai/providers/mockAIProvider';
import { mockRedisClient } from '../redis/mockRedisClient';
import { mockDocument } from '../documents/mockDocument';
import { documentRepository } from '../documents/documentRepository';
import { getTenantContext } from '../lib/tenant-context';
import { ContextProvider } from '../ai/ContextProvider';
import { AIService } from '../ai/AIService';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { MetricsCollector } from '../metrics/metrics-collector';
import { FeatureFlagService } from '../lib/feature-flags';
import { TokenLimiter } from '../ai/token-limiter';
import { ContentFilterPipeline } from '../compliance/filter-pipeline';
import { TenantAISettings } from '../ai/tenant-ai-settings';

export async function executeCompleteTextCommand(): Promise<any> {
  // Test data
  const testTenantId = 'test-tenant';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';

  // Mock services
  const documentRepository = {
    getDocument: jest.fn().mockResolvedValue(mockDocument)
  } as unknown as jest.Mocked<DocumentRepository>;

  const mockAIProvider = {
    getCompletion: jest.fn().mockResolvedValue({
      text: 'AI generated content for the request',
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      modelId: 'gpt-4'
    })
  };

  const mockCircuitBreaker = {
    execute: jest.fn().mockImplementation(fn => fn())
  } as unknown as jest.Mocked<CircuitBreaker>;

  const mockMetricsCollector = {
    incrementCounter: jest.fn(),
    recordValue: jest.fn()
  } as unknown as jest.Mocked<MetricsCollector>;

  const mockFeatureFlags = {
    isEnabled: jest.fn().mockResolvedValue(true)
  } as unknown as jest.Mocked<FeatureFlagService>;

  const mockTokenLimiter = {
    checkAndReserveTokens: jest.fn().mockResolvedValue(undefined)
  } as unknown as jest.Mocked<TokenLimiter>;

  const mockFilterPipeline = {
    process: jest.fn().mockResolvedValue({ result: 'ALLOWED', confidence: 1.0, reason: null })
  } as unknown as jest.Mocked<ContentFilterPipeline>;

  const mockTenantSettings = {
    getModelPreference: jest.fn().mockResolvedValue('gpt-4'),
    getPromptTemplate: jest.fn().mockResolvedValue('You are an AI assistant helping with document editing.')
  } as unknown as jest.Mocked<TenantAISettings>;

  const mockRedisClient = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK')
  };

  const contextProvider = new ContextProvider(documentRepository);

  const aiService = new AIService(
    mockAIProvider,
    mockCircuitBreaker,
    mockMetricsCollector,
    mockFeatureFlags,
    mockTokenLimiter,
    mockFilterPipeline,
    mockTenantSettings,
    mockRedisClient
  );

  const commandRegistry = {
    ...baseCommandRegistry,
    execute: jest.fn().mockImplementation(cmd => {
      // Simulate command execution
      if (cmd.type === 'INSERT_TEXT') {
        return Promise.resolve({
          documentId: cmd.documentId,
          position: cmd.position,
          text: cmd.text
        });
      } else if (cmd.type === 'REPLACE_TEXT') {
        return Promise.resolve({
          documentId: cmd.documentId,
          startPosition: cmd.startPosition,
          endPosition: cmd.endPosition,
          newText: cmd.newText
        });
      }
      return Promise.resolve({ success: true });
    })
  };

  const aiCommandRegistry = new AICommandRegistry(
    aiService,
    contextProvider,
    { trackTokenUsage: jest.fn() } as any
  );

  // Override the register method to hook into the base registry
  aiCommandRegistry.register = baseCommandRegistry.register;

  // Register commands
  await registerAICommands(aiCommandRegistry);

  const command: CompleteTextCommand = {
    type: 'COMPLETE_TEXT',
    documentId: testDocumentId,
    userId: testUserId,
    position: 120,
    prompt: 'Complete this paragraph',
    contextParameters: {
      windowSize: 200,
      includePreceding: true,
      includeFollowing: false
    },
    analysisParameters: {
      type: 'COMPLETE_TEXT',
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 100
    },
    requiresAIAnalysis: true
  };

  const handler = baseCommandRegistry.register.mock.calls.find(
    (call: any) => call[0] === 'COMPLETE_TEXT'
  )[1];

  return handler(command);
}