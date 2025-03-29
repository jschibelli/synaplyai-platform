import { AICommandRegistry } from '../../../src/ai/AICommandRegistry';
import { ContextProvider } from '../../../src/ai/ContextProvider';
import { AIService } from '../../../src/ai/AIService';
import { DocumentRepository } from '../../../src/ai/ContextProvider';
import { registerAICommands } from '../../../src/ai/commands/register-ai-commands';
import { getTenantContext } from '../../../src/lib/tenant-context';
import { CircuitBreaker } from '../../../src/lib/circuit-breaker';
import { MetricsCollector } from '../../../src/metrics/metrics-collector';
import { FeatureFlagService } from '../../../src/lib/feature-flags';
import { TokenLimiter } from '../../../src/ai/token-limiter';
import { ContentFilterPipeline } from '../../../src/compliance/filter-pipeline';
import { TenantAISettings } from '../../../src/ai/tenant-ai-settings';
import { CommandRegistry } from '../../../src/commands/CommandRegistry';
import { mockAIProvider } from '../../../src/ai/providers/mockAIProvider';
import { mockRedisClient } from '../../../src/redis/mockRedisClient';
import { mockDocument } from '../../../src/documents/mockDocument';
import { documentRepository } from '../../../src/documents/documentRepository';
import { testDocumentId, testUserId } from '../../../src/test/constants';
import { executeCompleteTextCommand } from '../../../src/commands/executeCompleteTextCommand';
import { PERFORMANCE_THRESHOLDS } from '../../../src/test/constants';
import { 
  CompleteTextCommand, 
  RewriteTextCommand,
  GrammarCheckCommand,
  AIAnalysisResult,
  AICommandContextParameters
} from '../../../src/tests/test-interfaces';
import { 
  createCompleteTextCommand,
  createRewriteTextCommand,
  createCompleteAnalysisResult,
  createGrammarCheckCommand
} from '../../../src/tests/test-helpers';

// Pre-initialize aiService for typechecking
let aiService: {
  analyze: jest.Mock;
};

// Mock dependencies
jest.mock('../../../src/lib/tenant-context');
jest.mock('../../../src/ai/tokenUtils');
jest.mock('../../../src/lib/circuit-breaker');
jest.mock('../../../src/metrics/metrics-collector');
jest.mock('../../../src/lib/feature-flags');
jest.mock('../../../src/ai/token-limiter');
jest.mock('../../../src/compliance/filter-pipeline');
jest.mock('../../../src/ai/tenant-ai-settings');

// SINGLE mock setup for mockAIProvider - remove the duplicate implementation below
jest.mock('../../../src/ai/providers/mockAIProvider', () => ({
  mockAIProvider: {
    getCompletion: jest.fn().mockResolvedValue({
      text: 'AI generated content for the request',
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      modelId: 'gpt-4'
    }),
    mock: {
      calls: []
    },
    mockResolvedValue: jest.fn(),
    mockResolvedValueOnce: jest.fn().mockReturnValue(jest.fn()),
    mockRejectedValue: jest.fn(),
    mockRejectedValueOnce: jest.fn().mockReturnValue(jest.fn()),
    mockImplementation: jest.fn(),
    mockImplementationOnce: jest.fn().mockReturnValue(jest.fn())
  }
}));

// Add to mock setup area

// Ensure proper mock methods exist on aiService
aiService.analyze.mockResolvedValueOnce = jest.fn().mockReturnValue(aiService.analyze);
aiService.analyze.mockRejectedValueOnce = jest.fn().mockReturnValue(aiService.analyze);

// Helper function to add the missing includeDocument property
function fixContextParameters(params: any): any {
  if (!params) {
    return {
      windowSize: 1000,
      includePreceding: true,
      includeFollowing: true,
      includeDocument: true  // Add missing required property
    };
  }
  
  return {
    ...params,
    includeDocument: params.includeDocument ?? true  // Add if missing
  };
}

// Helper function to update all context parameters
function updateContextParameters(params) {
  if (!params) {
    return {
      windowSize: 1000,
      includePreceding: true,
      includeFollowing: true,
      includeDocument: true
    };
  }
  
  return {
    ...params,
    includeDocument: params.includeDocument ?? true
  };
}

// Replace your existing monkey-patching with this approach
import * as testHelpers from '../../../src/tests/test-helpers';

// Type-safe monkey patching
const originalCreateCompleteTextCommand = testHelpers.createCompleteTextCommand;
(testHelpers.createCompleteTextCommand as any) = function(overrides: Partial<CompleteTextCommand> = {}): CompleteTextCommand {
  return originalCreateCompleteTextCommand({
    ...overrides,
    contextParameters: fixContextParameters(overrides.contextParameters)
  });
};

const originalCreateGrammarCheckCommand = testHelpers.createGrammarCheckCommand;
(testHelpers.createGrammarCheckCommand as any) = function(overrides: Partial<GrammarCheckCommand> = {}): GrammarCheckCommand {
  return originalCreateGrammarCheckCommand({
    ...overrides,
    contextParameters: fixContextParameters(overrides.contextParameters)
  });
};

// Move this to the top of the file
beforeEach(() => {
  // Initialize aiService first
  aiService = {
    analyze: jest.fn().mockResolvedValue({
      content: 'AI analyzed content',
      totalTokens: 100,
      promptTokens: 50,
      completionTokens: 50,
      modelId: 'gpt-4',
      metadata: {}
    })
  };

  // Then add the mock methods
  aiService.analyze.mockResolvedValueOnce = jest.fn().mockReturnValue(aiService.analyze);
  aiService.analyze.mockRejectedValueOnce = jest.fn().mockReturnValue(aiService.analyze);
  
  // Rest of your beforeEach setup
  // ...

  // Reset all mocks
  jest.clearAllMocks();
  
  // Set up tenant context mock
  (getTenantContext as jest.Mock).mockReturnValue({
    tenantId: testTenantId,
    userId: testUserId
  });

  // Set up document repository mock
  documentRepository = {
    getDocument: jest.fn().mockResolvedValue(mockDocument)
  } as unknown as jest.Mocked<DocumentRepository>;

  // Set up mock AI provider
  mockAIProvider = {
    getCompletion: jest.fn().mockResolvedValue({
      text: 'AI generated content for the request',
      totalTokens: 100,
      promptTokens: 80,
      completionTokens: 20,
      modelId: 'gpt-4'
    }),
    mock: { calls: [] }  // Add missing mock property
  };

  // Fix mockCircuitBreaker implementation error - 'execute' is duplicated
  mockCircuitBreaker = {
    execute: jest.fn().mockImplementation(fn => fn()),
    executeWithBulkhead: jest.fn().mockImplementation(fn => fn()),
    getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
    recordSuccess: jest.fn().mockResolvedValue(undefined),
    recordFailure: jest.fn().mockResolvedValue(undefined),
    transitionState: jest.fn().mockResolvedValue(undefined),
    shouldAttemptReset: jest.fn().mockReturnValue(false),
    serviceName: 'test-service',
    options: {
      failureThreshold: 5,
      resetTimeout: 30000
    }
  } as unknown as jest.Mocked<CircuitBreaker>;

  // Update the CommandRegistry mock

  // Mock command registry with all required methods
  (CommandRegistry as any).register = jest.fn().mockReturnValue({
    execute: jest.fn()
  });
  (CommandRegistry as any).execute = jest.fn();
  (CommandRegistry as any).middleware = [];
  (CommandRegistry as any).mock = { calls: [] };
  (CommandRegistry as any).hasCommand = jest.fn().mockReturnValue(true);
});

// Add after the beforeEach setup

// Define missing constants
const testTenantId = 'test-tenant-id';

// Update your test helper functions

/**
 * Execute a complete text command with proper type safety
 */
async function executeCompleteTextCommand(overrides: Partial<CompleteTextCommand> = {}): Promise<any> {
  // Register commands
  await registerAICommands(aiCommandRegistry);
  
  // Use the helper function for complete command object
  const completeTextCommand = createCompleteTextCommand({
    documentId: testDocumentId,
    userId: testUserId,
    prompt: 'Complete this paragraph',
    ...overrides
  });

  const handler = (CommandRegistry as any).register.mock.calls.find(
    (call: any) => call[0] === 'COMPLETE_TEXT'
  )?.[1];

  if (!handler) {
    throw new Error('COMPLETE_TEXT handler not found');
  }

  return handler(completeTextCommand);
}

/**
 * Execute an AI command with proper type safety
 */
async function executeAICommand(overrides: Partial<CompleteTextCommand> = {}): Promise<any> {
  await registerAICommands(aiCommandRegistry);
  
  const completeTextCommand = createCompleteTextCommand({
    documentId: testDocumentId,
    userId: testUserId,
    prompt: 'Test command',
    contextParameters: {
      windowSize: 200,
      includePreceding: true,
      includeFollowing: false,
      includeDocument: true
    },
    ...overrides
  });

  const handler = (CommandRegistry as any).register.mock.calls.find(
    (call: any) => call[0] === 'COMPLETE_TEXT'
  )?.[1];

  if (!handler) {
    throw new Error('COMPLETE_TEXT handler not found');
  }

  return handler(completeTextCommand);
}

// Add proper type annotations to test assertions

// Use explicit type assertions where needed
expect(aiService.analyze).toHaveBeenCalledWith(
  expect.objectContaining({
    type: 'COMPLETE_TEXT'
  }),
  expect.anything()
);

// Add explicit return type to handlers
const commandHandler = (CommandRegistry as any).register.mock.calls.find(
  (call: any) => call[0] === 'GRAMMAR_CHECK'
)?.[1] as ((command: GrammarCheckCommand) => Promise<any>);

// Update this in your test
aiCommandRegistry = new AICommandRegistry(
  aiService as any,
  contextProvider,
  { trackTokenUsage: jest.fn() } as any,
  mockCircuitBreaker  // Add the missing circuit breaker parameter
);

describe('AI Command Integration Flow', () => {
  // Shared test data and mocks
  let aiService: jest.Mocked<AIService>;
  let documentRepository: jest.Mocked<DocumentRepository>;
  let contextProvider: ContextProvider;
  let aiCommandRegistry: AICommandRegistry;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;
  
  // Define the test constants at file scope for clarity
  const testTenantId = 'test-tenant-id';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';
  
  // Initialize before each test
  beforeEach(() => {
    // Your existing setup code...
  });
  
  // Then group related tests in nested describe blocks
  describe('Complete Text Command', () => {
    test('should execute complete text command', async () => {
      const result = await executeCompleteTextCommand();
      
      // Use proper type assertions
      expect(result).toEqual(expect.objectContaining({
        documentId: testDocumentId,
        position: expect.any(Number),
        text: expect.any(String)
      } as Partial<TextCompletedEvent>));
      
      // Type safe mocking verification
      expect(aiService.analyze).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'COMPLETE_TEXT'
        } as Partial<AIAnalysisParameters>),
        expect.anything()
      );
    });
    
    // More tests...
  });
  
  describe('Grammar Check Command', () => {
    test('should execute grammar check command', async () => {
      // Test-specific code
    });
    
    // More tests...
  });
});
