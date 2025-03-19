import { AICommandRegistry } from '../../../src/ai/AICommandRegistry';
import { ContextProvider } from '../../../src/ai/ContextProvider';
import { AIService } from '../../../src/ai/AIService';
import { DocumentRepository } from '../../../src/ai/ContextProvider';
import { CompleteTextCommand } from '../../../src/ai/commands/text-completion-command';
import { RewriteTextCommand } from '../../../src/ai/commands/text-rewrite-command';
import { GrammarCheckCommand } from '../../../src/ai/commands/grammar-check-command';
import { registerAICommands } from '../../../src/ai/commands/register-ai-commands';
import { getTenantContext } from '../../../src/lib/tenant-context';
import { CircuitBreaker } from '../../../src/lib/circuit-breaker';
import { MetricsCollector } from '../../../src/metrics/metrics-collector';
import { FeatureFlagService } from '../../../src/lib/feature-flags';
import { TokenLimiter } from '../../../src/ai/token-limiter';
import { ContentFilterPipeline } from '../../../src/compliance/filter-pipeline';
import { TenantAISettings } from '../../../src/ai/tenant-ai-settings';

// Mock dependencies
jest.mock('../../../src/lib/tenant-context');
jest.mock('../../../src/ai/tokenUtils');
jest.mock('../../../src/lib/circuit-breaker');
jest.mock('../../../src/metrics/metrics-collector');
jest.mock('../../../src/lib/feature-flags');
jest.mock('../../../src/ai/token-limiter');
jest.mock('../../../src/compliance/filter-pipeline');
jest.mock('../../../src/ai/tenant-ai-settings');

describe('AI Command Integration Flow', () => {
  // Test data
  const testTenantId = 'test-tenant';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';

  // Mock services
  let documentRepository: jest.Mocked<DocumentRepository>;
  let mockAIProvider: any;
  let contextProvider: ContextProvider;
  let aiService: AIService;
  let aiCommandRegistry: AICommandRegistry;
  let commandRegistry: any;
  let mockRedisClient: any;

  // Mock command registry that will be wrapped by AICommandRegistry
  const baseCommandRegistry = {
    register: jest.fn(),
    execute: jest.fn(),
    middleware: []
  };

  // Mock document
  const mockDocument = {
    id: testDocumentId,
    content: 'This is the document content with some text that will be analyzed. ' +
             'It contains a sentense with a spelling error. ' +
             'The cursor is positioned here|, ready for completion.',
    metadata: { 
      id: testDocumentId,
      title: 'Test Document',
      created: '2025-03-20T10:00:00Z'
    }
  };

  beforeEach(() => {
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
      })
    };

    // Set up mock circuit breaker
    const mockCircuitBreaker = {
      execute: jest.fn().mockImplementation(fn => fn())
    } as unknown as jest.Mocked<CircuitBreaker>;

    // Set up metrics collector
    const mockMetricsCollector = {
      incrementCounter: jest.fn(),
      recordValue: jest.fn()
    } as unknown as jest.Mocked<MetricsCollector>;

    // Set up feature flags
    const mockFeatureFlags = {
      isEnabled: jest.fn().mockResolvedValue(true)
    } as unknown as jest.Mocked<FeatureFlagService>;

    // Set up token limiter
    const mockTokenLimiter = {
      checkAndReserveTokens: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<TokenLimiter>;

    // Set up filter pipeline
    const mockFilterPipeline = {
      process: jest.fn().mockResolvedValue({ result: 'ALLOWED', confidence: 1.0, reason: null })
    } as unknown as jest.Mocked<ContentFilterPipeline>;

    // Set up tenant AI settings
    const mockTenantSettings = {
      getModelPreference: jest.fn().mockResolvedValue('gpt-4'),
      getPromptTemplate: jest.fn().mockResolvedValue('You are an AI assistant helping with document editing.')
    } as unknown as jest.Mocked<TenantAISettings>;

    // Mock Redis client
    mockRedisClient = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK')
    };

    // Set up context provider
    contextProvider = new ContextProvider(documentRepository);

    // Set up AI service
    aiService = new AIService(
      mockAIProvider,
      mockCircuitBreaker,
      mockMetricsCollector,
      mockFeatureFlags,
      mockTokenLimiter,
      mockFilterPipeline,
      mockTenantSettings,
      mockRedisClient
    );

    // Set up command registry
    commandRegistry = {
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

    // Create the AI command registry
    aiCommandRegistry = new AICommandRegistry(
      aiService,
      contextProvider,
      { trackTokenUsage: jest.fn() } as any
    );

    // Override the register method to hook into the base registry
    aiCommandRegistry.register = baseCommandRegistry.register;
  });

  // Add after the test data declarations
  async function executeCompleteTextCommand(): Promise<any> {
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
      call => call[0] === 'COMPLETE_TEXT'
    )[1];
  
    return handler(command);
  }
  
  async function executeAICommand(): Promise<void> {
    await registerAICommands(aiCommandRegistry);
    
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Test command',
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
      call => call[0] === 'COMPLETE_TEXT'
    )[1];
  
    await handler(command);
  }

  describe('Command Registration', () => {
    test('should register all AI commands with registry', async () => {
      // Register AI commands
      await registerAICommands(aiCommandRegistry);
      
      // Verify command registration
      expect(baseCommandRegistry.register).toHaveBeenCalledTimes(3);
      expect(baseCommandRegistry.register).toHaveBeenCalledWith(
        'COMPLETE_TEXT',
        expect.any(Function),
        expect.objectContaining({
          validator: expect.any(Function)
        })
      );
      expect(baseCommandRegistry.register).toHaveBeenCalledWith(
        'REWRITE_TEXT',
        expect.any(Function),
        expect.objectContaining({
          validator: expect.any(Function)
        })
      );
      expect(baseCommandRegistry.register).toHaveBeenCalledWith(
        'GRAMMAR_CHECK',
        expect.any(Function),
        expect.objectContaining({
          validator: expect.any(Function)
        })
      );
    });
  });

  describe('Text Completion Flow', () => {
    test('should execute complete text command end-to-end', async () => {
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Create a text completion command
      const completeTextCommand: CompleteTextCommand = {
        type: 'COMPLETE_TEXT',
        documentId: testDocumentId,
        userId: testUserId,
        position: 120, // Position in document for completion
        prompt: 'Complete this paragraph naturally',
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
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'COMPLETE_TEXT'
      )[1];
      
      // Execute the handler with the command
      const result = await commandHandler(completeTextCommand);
      
      // Verify document repository was called to get context
      expect(documentRepository.getDocument).toHaveBeenCalledWith(
        testDocumentId, 
        testTenantId
      );
      
      // Verify AI provider was called to get completion
      expect(mockAIProvider.getCompletion).toHaveBeenCalled();
      
      // Verify the command registry was called to execute an INSERT_TEXT command
      expect(commandRegistry.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INSERT_TEXT',
          documentId: testDocumentId,
          position: completeTextCommand.position,
          userId: testUserId
        })
      );
      
      // Verify the result structure
      expect(result).toMatchObject({
        documentId: testDocumentId,
        position: completeTextCommand.position,
        text: expect.any(String),
        userId: testUserId,
        aiGenerated: true,
        modelId: expect.any(String),
        prompt: completeTextCommand.prompt
      });
    });
  });

  describe('Rewrite Text Flow', () => {
    test('should execute rewrite text command end-to-end', async () => {
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Create a rewrite text command
      const rewriteTextCommand: RewriteTextCommand = {
        type: 'REWRITE_TEXT',
        documentId: testDocumentId,
        userId: testUserId,
        selectionStart: 50,
        selectionEnd: 100,
        instructions: 'Make this more concise',
        contextParameters: {
          windowSize: 200,
          includePreceding: true,
          includeFollowing: true,
          includeMetadata: true
        },
        analysisParameters: {
          type: 'REWRITE_SELECTION',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 150
        },
        requiresAIAnalysis: true
      };
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'REWRITE_TEXT'
      )[1];
      
      // Execute the handler with the command
      const result = await commandHandler(rewriteTextCommand);
      
      // Verify document repository was called to get context
      expect(documentRepository.getDocument).toHaveBeenCalledWith(
        testDocumentId, 
        testTenantId
      );
      
      // Verify AI provider was called
      expect(mockAIProvider.getCompletion).toHaveBeenCalled();
      
      // Verify the command registry was called with REPLACE_TEXT
      expect(commandRegistry.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REPLACE_TEXT',
          documentId: testDocumentId,
          startPosition: rewriteTextCommand.selectionStart,
          endPosition: rewriteTextCommand.selectionEnd,
          userId: testUserId
        })
      );
      
      // Verify the result structure
      expect(result).toMatchObject({
        documentId: testDocumentId,
        selectionStart: rewriteTextCommand.selectionStart,
        selectionEnd: rewriteTextCommand.selectionEnd,
        originalText: expect.any(String),
        newText: expect.any(String),
        userId: testUserId,
        aiGenerated: true,
        modelId: expect.any(String),
        instructions: rewriteTextCommand.instructions
      });
    });
  });

  describe('Grammar Check Flow', () => {
    test('should execute grammar check command end-to-end', async () => {
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Set up AI response with grammar corrections
      mockAIProvider.getCompletion.mockResolvedValue({
        text: 'This is the document content with some text that will be analyzed. ' +
              'It contains a sentence with a spelling error. ' +
              'The cursor is positioned here, ready for completion.',
        totalTokens: 120,
        promptTokens: 90,
        completionTokens: 30,
        modelId: 'gpt-4'
      });
      
      // Create a grammar check command
      const grammarCheckCommand: GrammarCheckCommand = {
        type: 'GRAMMAR_CHECK',
        documentId: testDocumentId,
        userId: testUserId,
        selectionStart: 40,
        selectionEnd: 90,
        contextParameters: {
          windowSize: 200,
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
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'GRAMMAR_CHECK'
      )[1];
      
      // Execute the handler with the command
      const result = await commandHandler(grammarCheckCommand);
      
      // Verify document repository was called to get context
      expect(documentRepository.getDocument).toHaveBeenCalledWith(
        testDocumentId, 
        testTenantId
      );
      
      // Verify AI provider was called
      expect(mockAIProvider.getCompletion).toHaveBeenCalled();
      
      // Verify the command registry was called with REPLACE_TEXT
      expect(commandRegistry.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REPLACE_TEXT',
          documentId: testDocumentId,
          startPosition: grammarCheckCommand.selectionStart,
          endPosition: grammarCheckCommand.selectionEnd,
          userId: testUserId
        })
      );
      
      // Verify the result structure
      expect(result).toMatchObject({
        documentId: testDocumentId,
        selectionStart: grammarCheckCommand.selectionStart,
        selectionEnd: grammarCheckCommand.selectionEnd,
        originalText: expect.any(String),
        correctedText: expect.any(String),
        userId: testUserId,
        aiGenerated: true,
        modelId: expect.any(String)
      });
      
      // Verify corrections were parsed
      expect(result.corrections).toBeDefined();
      // The specific change from "sentense" to "sentence" should be detected
      expect(result.corrections.some(c => 
        c.original.includes('sentense') && c.corrected.includes('sentence')
      )).toBe(true);
    });
  });

  describe('Error Handling', () => {
    test('should handle AI service errors', async () => {
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Set up AI provider to throw an error
      mockAIProvider.getCompletion.mockRejectedValue(new Error('AI service unavailable'));
      
      // Create a completion command
      const completeTextCommand: CompleteTextCommand = {
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
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'COMPLETE_TEXT'
      )[1];
      
      // Execute the handler and expect it to throw
      await expect(commandHandler(completeTextCommand))
        .rejects
        .toThrow(/AI analysis failed/);
      
      // Verify the insert command was not executed
      expect(commandRegistry.execute).not.toHaveBeenCalled();
    });
    
    test('should handle command execution errors', async () => {
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Set up command registry to throw an error
      commandRegistry.execute.mockRejectedValue(new Error('Document locked'));
      
      // Create a rewrite command
      const rewriteTextCommand: RewriteTextCommand = {
        type: 'REWRITE_TEXT',
        documentId: testDocumentId,
        userId: testUserId,
        selectionStart: 50,
        selectionEnd: 100,
        instructions: 'Make this more concise',
        contextParameters: {
          windowSize: 200,
          includePreceding: true,
          includeFollowing: true,
          includeMetadata: true
        },
        analysisParameters: {
          type: 'REWRITE_SELECTION',
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 150
        },
        requiresAIAnalysis: true
      };
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'REWRITE_TEXT'
      )[1];
      
      // Execute the handler and expect it to throw
      await expect(commandHandler(rewriteTextCommand))
        .rejects
        .toThrow('Document locked');
      
      // Verify AI was still called before the error
      expect(mockAIProvider.getCompletion).toHaveBeenCalled();
    });
  });

  describe('Tenant Isolation', () => {
    test('should enforce tenant isolation by checking tenant context', async () => {
      // Remove tenant context
      (getTenantContext as jest.Mock).mockReturnValue(undefined);
      
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Create a simple command
      const completeTextCommand: CompleteTextCommand = {
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
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'COMPLETE_TEXT'
      )[1];
      
      // Execute the handler and expect it to throw due to missing tenant context
      await expect(commandHandler(completeTextCommand))
        .rejects
        .toThrow(/No tenant context available/);
      
      // Verify AI was not called
      expect(mockAIProvider.getCompletion).not.toHaveBeenCalled();
    });
  });

  describe('Feature Flags', () => {
    test('should respect feature flags for AI commands', async () => {
      // Set feature flag to disabled
      (aiService as any).featureFlags.isEnabled.mockResolvedValue(false);
      
      // Register commands
      await registerAICommands(aiCommandRegistry);
      
      // Create a grammar check command
      const grammarCheckCommand: GrammarCheckCommand = {
        type: 'GRAMMAR_CHECK',
        documentId: testDocumentId,
        userId: testUserId,
        selectionStart: 40,
        selectionEnd: 90,
        contextParameters: {
          windowSize: 200,
          includePreceding: true,
          includeFollowing: true
        },
        analysisParameters: {
          type: 'CHECK_GRAMMAR',
          model: 'gpt-3.5-turbo',
          temperature: 0.3,
          maxTokens: 100
        },
        requiresAIAnalysis: true
      };
      
      // Get the registered handler
      const commandHandler = baseCommandRegistry.register.mock.calls.find(
        call => call[0] === 'GRAMMAR_CHECK'
      )[1];
      
      // Execute the handler and expect it to throw due to disabled feature
      await expect(commandHandler(grammarCheckCommand))
        .rejects
        .toThrow(/not enabled for this tenant/);
      
      // Verify AI was not called
      expect(mockAIProvider.getCompletion).not.toHaveBeenCalled();
    });
  });
});

describe('AI Command Performance', () => {
  const PERFORMANCE_THRESHOLDS = {
    contextExtraction: 50, // ms
    aiAnalysis: 500, // ms
    commandExecution: 100, // ms
    totalOperation: 650 // ms
  };

  test('should complete text command within performance thresholds', async () => {
    const startTime = performance.now();
    
    // Execute complete text command
    const result = await executeCompleteTextCommand();
    
    const metrics = {
      contextExtraction: result.metrics.contextExtractionTime,
      aiAnalysis: result.metrics.aiAnalysisTime,
      commandExecution: result.metrics.commandExecutionTime,
      total: performance.now() - startTime
    };

    // Assert performance thresholds
    expect(metrics.contextExtraction).toBeLessThan(PERFORMANCE_THRESHOLDS.contextExtraction);
    expect(metrics.aiAnalysis).toBeLessThan(PERFORMANCE_THRESHOLDS.aiAnalysis);
    expect(metrics.commandExecution).toBeLessThan(PERFORMANCE_THRESHOLDS.commandExecution);
    expect(metrics.total).toBeLessThan(PERFORMANCE_THRESHOLDS.totalOperation);
  });

  test('should handle concurrent AI commands efficiently', async () => {
    const concurrentCommands = 5;
    const commands = Array(concurrentCommands).fill(null).map(() => executeCompleteTextCommand());
    
    const startTime = performance.now();
    const results = await Promise.all(commands);
    const totalTime = performance.now() - startTime;

    // Verify total execution time scales reasonably with concurrent requests
    expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.totalOperation * 2);

    // Verify all commands completed successfully
    results.forEach(result => {
      expect(result).toMatchObject({
        documentId: testDocumentId,
        text: expect.any(String),
        aiGenerated: true
      });
    });
  });

  test('should maintain performance with context size variations', async () => {
    const variations = [
      { windowSize: 100, expectedBonus: 0 },
      { windowSize: 500, expectedBonus: 50 },
      { windowSize: 1000, expectedBonus: 100 }
    ];

    for (const { windowSize, expectedBonus } of variations) {
      const startTime = performance.now();
      
      const result = await executeCompleteTextCommand({
        contextParameters: { windowSize }
      });

      const executionTime = performance.now() - startTime;
      
      // Allow extra time for larger context windows
      expect(executionTime).toBeLessThan(
        PERFORMANCE_THRESHOLDS.totalOperation + expectedBonus
      );
    }
  });
});

// Add to existing test file
describe('Usage Tracking', () => {
  test('should track AI command token usage', async () => {
    const mockUsageTracker = {
      trackTokenUsage: jest.fn().mockResolvedValue(true)
    };

    // Execute command
    await executeAICommand();

    // Verify usage tracking
    expect(mockUsageTracker.trackTokenUsage).toHaveBeenCalledWith(
      testTenantId,
      'gpt-4',
      expect.any(Number)
    );
  });

  test('should handle usage tracking failures gracefully', async () => {
    const mockUsageTracker = {
      trackTokenUsage: jest.fn().mockRejectedValue(new Error('Usage tracking failed'))
    };

    aiCommandRegistry = new AICommandRegistry(
      aiService,
      contextProvider,
      mockUsageTracker
    );

    // Command should still execute even if usage tracking fails
    const result = await executeCompleteTextCommand();
    expect(result).toBeDefined();
    expect(result.aiGenerated).toBe(true);
  });

  test('should aggregate token usage for multi-step commands', async () => {
    const tokenUsages: number[] = [];
    const mockUsageTracker = {
      trackTokenUsage: jest.fn().mockImplementation((tenantId, modelId, tokens) => {
        tokenUsages.push(tokens);
        return Promise.resolve(true);
      })
    };

    aiCommandRegistry = new AICommandRegistry(
      aiService,
      contextProvider,
      mockUsageTracker
    );

    // Execute a rewrite command which typically involves multiple AI calls
    const command: RewriteTextCommand = {
      type: 'REWRITE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      selectionStart: 50,
      selectionEnd: 100,
      instructions: 'Make this more concise',
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true
      },
      analysisParameters: {
        type: 'REWRITE_SELECTION',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 150
      },
      requiresAIAnalysis: true
    };

    await executeAICommand(command);

    // Verify multiple usage tracking calls
    expect(tokenUsages.length).toBeGreaterThan(0);
    expect(tokenUsages.reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
  });
});

describe('AI Command Caching', () => {
  test('should cache AI responses when enabled', async () => {
    // Create a command with caching enabled
    const command: GrammarCheckCommand = {
      type: 'GRAMMAR_CHECK',
      documentId: testDocumentId,
      userId: testUserId,
      selectionStart: 40,
      selectionEnd: 90,
      contextParameters: {
        windowSize: 200,
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

    // Execute command twice
    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'GRAMMAR_CHECK'
    )[1];

    await handler(command);
    await handler(command);

    // Verify AI provider was only called once
    expect(mockAIProvider.getCompletion).toHaveBeenCalledTimes(1);
    
    // Verify Redis cache was used
    expect(mockRedisClient.get).toHaveBeenCalled();
    expect(mockRedisClient.set).toHaveBeenCalled();
  });

  test('should respect cache TTL settings', async () => {
    jest.useFakeTimers();
    
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: false
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        cache: true,
        cacheTTL: 60 // 60 seconds
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(command);
    
    // Advance time past TTL
    jest.advanceTimersByTime(61000);
    
    await handler(command);

    // Should call AI provider again after TTL expires
    expect(mockAIProvider.getCompletion).toHaveBeenCalledTimes(2);
    
    jest.useRealTimers();
  });

  test('should invalidate cache when parameters change', async () => {
    const baseCommand: GrammarCheckCommand = {
      type: 'GRAMMAR_CHECK',
      documentId: testDocumentId,
      userId: testUserId,
      selectionStart: 40,
      selectionEnd: 90,
      contextParameters: {
        windowSize: 200,
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

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'GRAMMAR_CHECK'
    )[1];

    // First execution
    await handler(baseCommand);

    // Change temperature parameter
    const modifiedCommand = {
      ...baseCommand,
      analysisParameters: {
        ...baseCommand.analysisParameters,
        temperature: 0.5
      }
    };

    // Execute with modified parameters
    await handler(modifiedCommand);

    // Should call AI provider twice due to different parameters
    expect(mockAIProvider.getCompletion).toHaveBeenCalledTimes(2);
    expect(mockRedisClient.get).toHaveBeenCalledTimes(2);
  });
});

describe('Context Optimization', () => {
  test('should optimize context window based on document size', async () => {
    const largeContent = 'A'.repeat(10000); // Create large document content
    const mockLargeDocument = {
      ...mockDocument,
      content: largeContent
    };

    // Override document repository to return large document
    documentRepository.getDocument.mockResolvedValueOnce(mockLargeDocument);

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 5000, // Middle of document
      contextParameters: {
        windowSize: 2000,
        includePreceding: true,
        includeFollowing: true
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        maxTokens: 100
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Verify context was optimized
    expect(mockAIProvider.getCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringMatching(/^.{1,4000}$/), // Context should be truncated
        parameters: expect.objectContaining({
          max_tokens: 100
        })
      })
    );
  });

  test('should preserve semantic boundaries when truncating context', async () => {
    const structuredContent = [
      'First paragraph with complete thoughts.',
      'Second paragraph that should be preserved intact.',
      'Third paragraph that might be truncated but only at sentence boundaries.',
      'Fourth paragraph that should be included fully.'
    ].join('\n\n');

    const mockStructuredDocument = {
      ...mockDocument,
      content: structuredContent
    };

    documentRepository.getDocument.mockResolvedValueOnce(mockStructuredDocument);

    const result = await executeCompleteTextCommand();

    // Verify context preserves paragraph boundaries
    const aiCallContent = mockAIProvider.getCompletion.mock.calls[0][0].content;
    expect(aiCallContent.split('\n\n').every(para => 
      structuredContent.includes(para)
    )).toBe(true);
  });

  test('should maintain semantic integrity with section markers', async () => {
    const contentWithSections = [
      '# Section 1',
      'Content for first section with important context.',
      '## Subsection 1.1',
      'Detailed subsection content that should be preserved.',
      '# Section 2',
      'Second section content that provides context.',
      'More content for understanding.'
    ].join('\n\n');

    const mockSectionedDocument = {
      ...mockDocument,
      content: contentWithSections
    };

    documentRepository.getDocument.mockResolvedValueOnce(mockSectionedDocument);

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: contentWithSections.indexOf('# Section 2'),
      contextParameters: {
        windowSize: 1000,
        includePreceding: true,
        includeFollowing: true,
        preserveStructure: true
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        maxTokens: 100
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(command);

    // Verify section markers are preserved in context
    const aiCallContent = mockAIProvider.getCompletion.mock.calls[0][0].content;
    expect(aiCallContent).toMatch(/# Section [12]/);
    expect(aiCallContent).toMatch(/## Subsection 1.1/);
  });

  test('should prioritize relevant context within token limits', async () => {
    const commandWithTokenLimit: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 500,
      contextParameters: {
        windowSize: 2000,
        includePreceding: true,
        includeFollowing: true,
        maxTokens: 200 // Explicit token limit for context
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        maxTokens: 50
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(commandWithTokenLimit);

    // Verify context was optimized within token limits
    expect(mockAIProvider.getCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          max_context_tokens: 200
        })
      })
    );
  });
});

describe('AI Command Intent Detection', () => {
  test('should detect and route ambiguous commands correctly', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Fix grammar and make more concise',
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true,
        detectIntent: true
      },
      analysisParameters: {
        type: 'AUTO_DETECT',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 100
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(command);

    // Verify intent detection was used
    expect(mockAIProvider.getCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        parameters: expect.objectContaining({
          type: 'AUTO_DETECT'
        }),
        content: expect.stringMatching(/intent classification/)
      })
    );
  });

  test('should fallback gracefully when intent detection fails', async () => {
    mockAIProvider.getCompletion.mockRejectedValueOnce(new Error('Intent detection failed'));

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Improve this text',
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true,
        detectIntent: true
      },
      analysisParameters: {
        type: 'AUTO_DETECT',
        model: 'gpt-4',
        fallbackType: 'COMPLETE_TEXT'
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Verify fallback to default command type
    expect(result.commandType).toBe('COMPLETE_TEXT');
  });

  test('should handle multiple intents in single command', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Fix spelling errors and rewrite to be more formal',
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true,
        detectIntent: true,
        allowMultipleIntents: true
      },
      analysisParameters: {
        type: 'AUTO_DETECT',
        model: 'gpt-4',
        temperature: 0.3,
        maxTokens: 150
      },
      requiresAIAnalysis: true
    };

    mockAIProvider.getCompletion.mockResolvedValueOnce({
      intents: ['GRAMMAR_CHECK', 'REWRITE_TEXT'],
      confidence: 0.95,
      text: 'Corrected and formal version...'
    });

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Verify multiple intents were processed
    expect(result.appliedIntents).toContain('GRAMMAR_CHECK');
    expect(result.appliedIntents).toContain('REWRITE_TEXT');
    expect(result.processingSteps.length).toBeGreaterThan(1);
  });

  test('should respect intent priority order', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Fix grammar then complete the sentence',
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true,
        detectIntent: true,
        intentPriorities: ['GRAMMAR_CHECK', 'COMPLETE_TEXT']
      },
      analysisParameters: {
        type: 'AUTO_DETECT',
        model: 'gpt-4'
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(command);

    // Verify intents were processed in priority order
    const processingOrder = mockAIProvider.getCompletion.mock.calls.map(
      call => call[0].parameters.type
    );
    expect(processingOrder[0]).toBe('GRAMMAR_CHECK');
    expect(processingOrder[1]).toBe('COMPLETE_TEXT');
  });
});

describe('AI Command Error Boundaries', () => {
  test('should handle partial context extraction failures', async () => {
    // Mock partial context failure
    documentRepository.getDocument.mockImplementationOnce(() => {
      throw new Error('Failed to load document metadata');
    });

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true,
        fallbackToPartialContext: true
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4'
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Should still execute with limited context
    expect(result).toBeDefined();
    expect(result.contextLimitations).toContain('PARTIAL_METADATA');
  });

  test('should recover from transient AI service failures', async () => {
    mockAIProvider.getCompletion
      .mockRejectedValueOnce(new Error('Service temporarily unavailable'))
      .mockRejectedValueOnce(new Error('Rate limit exceeded'))
      .mockResolvedValueOnce({
        text: 'Success on third try',
        totalTokens: 100
      });

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        retryAttempts: 3,
        retryDelay: 100
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Should succeed after retries
    expect(result.text).toBe('Success on third try');
    expect(result.retryCount).toBe(2);
  });

  test('should maintain state consistency during partial failures', async () => {
    const states: string[] = [];
    mockAIProvider.getCompletion.mockImplementation(async () => {
      states.push('AI_CALLED');
      throw new Error('Partial processing failure');
    });

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    try {
      await handler(command);
    } catch (error) {
      // Expected failure
    }

    // Verify no incomplete state changes were persisted
    expect(commandRegistry.execute).not.toHaveBeenCalled();
    expect(states).toEqual(['AI_CALLED']);
  });
});

describe('AI Command Pipeline Transformation', () => {
  test('should apply command transformations in order', async () => {
    const transformations = [
      'INTENT_CAPTURE',
      'CONTEXT_ENRICHMENT',
      'TOKEN_OPTIMIZATION',
      'PROMPT_ENHANCEMENT'
    ];
    
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Complete this text',
      transformations,
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Verify transformations were applied in order
    expect(result.appliedTransformations).toEqual(transformations);
    expect(result.metrics.transformationOrder).toEqual(transformations);
  });
});

describe('AI Command State Recovery', () => {
  test('should recover command state after system interruption', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Complete this text',
      stateRecovery: true,
      requiresAIAnalysis: true
    };

    // Simulate system interruption
    mockAIProvider.getCompletion.mockImplementationOnce(() => {
      process.emit('SIGTERM');
      throw new Error('Process terminated');
    });

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    // Attempt command execution
    try {
      await handler(command);
    } catch (error) {
      // Expected failure
    }

    // Verify state was saved
    expect(mockRedisClient.set).toHaveBeenCalledWith(
      expect.stringContaining('command-state'),
      expect.any(String)
    );

    // Simulate process restart and retry
    const result = await handler(command);
    
    // Verify command completed successfully
    expect(result).toBeDefined();
    expect(result.recoveredFromState).toBe(true);
  });
});

describe('Command Progress Tracking', () => {
  test('should track and report command progress', async () => {
    const progressUpdates: any[] = [];
    const progressCallback = (update: any) => progressUpdates.push(update);

    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Complete this text',
      onProgress: progressCallback,
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(command);

    // Verify progress tracking
    expect(progressUpdates).toContainEqual(
      expect.objectContaining({
        phase: 'CONTEXT_EXTRACTION',
        progress: expect.any(Number)
      })
    );
    expect(progressUpdates).toContainEqual(
      expect.objectContaining({
        phase: 'AI_ANALYSIS',
        progress: expect.any(Number)
      })
    );
    expect(progressUpdates).toContainEqual(
      expect.objectContaining({
        phase: 'COMMAND_EXECUTION',
        progress: expect.any(Number)
      })
    );
  });
});

describe('Command Parameter Validation', () => {
  test('should validate required command parameters', async () => {
    const invalidCommand: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: -1, // Invalid position
      contextParameters: {
        windowSize: 0, // Invalid window size
        includePreceding: true,
        includeFollowing: true
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        temperature: 2.0, // Invalid temperature
        maxTokens: 0 // Invalid token count
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await expect(handler(invalidCommand)).rejects.toThrow(/Invalid command parameters/);
  });

  test('should enforce tenant-specific parameter limits', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      contextParameters: {
        windowSize: 5000, // Exceeds tenant limit
        includePreceding: true,
        includeFollowing: true
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        maxTokens: 1000 // Exceeds tenant limit
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await expect(handler(command)).rejects.toThrow(/Exceeds tenant limits/);
  });
});

describe('Command Pipeline Metrics', () => {
  test('should collect detailed pipeline metrics', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Complete this text',
      requiresAIAnalysis: true,
      collectMetrics: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    const result = await handler(command);

    // Verify metrics collection
    expect(result.metrics).toMatchObject({
      pipelineStartTime: expect.any(Number),
      pipelineEndTime: expect.any(Number),
      totalDuration: expect.any(Number),
      stages: expect.arrayContaining([
        expect.objectContaining({
          name: 'VALIDATION',
          duration: expect.any(Number)
        }),
        expect.objectContaining({
          name: 'CONTEXT_EXTRACTION',
          duration: expect.any(Number)
        }),
        expect.objectContaining({
          name: 'AI_ANALYSIS',
          duration: expect.any(Number)
        })
      ]),
      tokenUsage: expect.objectContaining({
        prompt: expect.any(Number),
        completion: expect.any(Number),
        total: expect.any(Number)
      })
    });
  });

  test('should track pipeline performance thresholds', async () => {
    const metricsCollector = new MetricsCollector(mockRedisClient);
    
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Complete this text',
      requiresAIAnalysis: true,
      collectMetrics: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    await handler(command);

    // Verify metrics were recorded
    expect(metricsCollector.recordValue).toHaveBeenCalledWith(
      'ai.command.pipeline.duration',
      expect.any(Number),
      expect.objectContaining({
        tenantId: testTenantId,
        commandType: 'COMPLETE_TEXT'
      })
    );
  });
});

describe('Command Optimization', () => {
  test('should batch similar commands for efficiency', async () => {
    const commands = [
      {
        type: 'COMPLETE_TEXT',
        documentId: testDocumentId,
        userId: testUserId,
        position: 120,
        prompt: 'First completion'
      },
      {
        type: 'COMPLETE_TEXT',
        documentId: testDocumentId,
        userId: testUserId,
        position: 150,
        prompt: 'Second completion'
      }
    ];

    const startTime = performance.now();
    
    await Promise.all(commands.map(cmd => 
      executeCompleteTextCommand(cmd)
    ));

    const totalTime = performance.now() - startTime;

    // Verify batching optimization
    expect(mockAIProvider.getCompletion).toHaveBeenCalledTimes(1);
    expect(totalTime).toBeLessThan(PERFORMANCE_THRESHOLDS.totalOperation);
  });

  test('should optimize command analysis for similar contexts', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: testDocumentId,
      userId: testUserId,
      position: 120,
      prompt: 'Optimize analysis',
      contextParameters: {
        windowSize: 200,
        includePreceding: true,
        includeFollowing: true,
        reuseContext: true
      },
      requiresAIAnalysis: true
    };

    const handler = baseCommandRegistry.register.mock.calls.find(
      call => call[0] === 'COMPLETE_TEXT'
    )[1];

    // Execute command twice in similar context
    await handler(command);
    await handler({
      ...command,
      position: 125 // Slightly different position
    });

    // Verify context reuse
    expect(documentRepository.getDocument).toHaveBeenCalledTimes(1);
  });
});