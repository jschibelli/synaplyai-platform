import { AICommandHandler } from '../../../src/ai/commands/AICommandHandler';
import { createCompleteAnalysisResult } from '../../../src/tests/test-helpers';
import { 
  CompleteTextCommand, 
  AIAnalysisResult 
} from '../../../src/tests/test-interfaces';
import { TenantContext } from '../../../src/tenant/TenantContext';
import { MetricsCollector } from '../../../src/services/metrics/MetricsCollector';
import { RedisCircuitBreakerStore } from '../../../src/circuit-breaker/redis-store';
import { AIService } from '../../../src/services/ai/AIService';
import { CircuitBreaker } from '../../../src/circuit-breaker/CircuitBreaker';
import { CircuitState } from '../../../src/lib/circuit-breaker';

describe('AICommandHandler', () => {
  let commandHandler: AICommandHandler;
  let mockTenantContext: any;
  let mockMetricsCollector: any;
  let mockCircuitBreakerStore: any;
  let mockAIService: any;
  let mockCircuitBreaker: any;

  beforeEach(() => {
    // Use global mock circuit breaker
    mockCircuitBreaker = global.mockCircuitBreaker;

    // Setup mock dependencies
    mockTenantContext = {
      getCurrentTenant: jest.fn().mockReturnValue('test-tenant-1')
    };

    mockMetricsCollector = global.mockMetricsCollector;

    mockCircuitBreakerStore = {
      getState: jest.fn().mockResolvedValue('CLOSED'),
      setState: jest.fn().mockResolvedValue(undefined),
      incrementFailures: jest.fn().mockResolvedValue(0),
      incrementSuccesses: jest.fn().mockResolvedValue(0),
      resetCounters: jest.fn().mockResolvedValue(undefined),
      getLastStateChange: jest.fn().mockResolvedValue(new Date()),
      setLastStateChange: jest.fn().mockResolvedValue(undefined),
      getBreaker: jest.fn().mockResolvedValue(mockCircuitBreaker)
    };

    mockAIService = {
      analyze: jest.fn()
    };

    commandHandler = new AICommandHandler(
      mockTenantContext,
      mockMetricsCollector,
      mockCircuitBreakerStore,
      mockAIService
    );
  });

  test('should execute AI command successfully', async () => {
    const command: CompleteTextCommand = {
      type: 'COMPLETE_TEXT',
      documentId: 'doc-1',
      userId: 'user-1',
      position: 0,
      requiresAIAnalysis: true,
      contextParameters: {
        windowSize: 100,
        includePreceding: true,
        includeFollowing: true,
        includeDocument: true
      },
      analysisParameters: {
        type: 'COMPLETE_TEXT',
        model: 'gpt-4',
        temperature: 0.7,
        maxTokens: 100
      },
      parameters: {
        type: 'COMPLETE_TEXT'
      }
    };

    const context = {
      tenantId: 'test-tenant-1',
      documentId: 'doc-1',
      selectedText: 'test content'
    };

    // Use our helper to create proper result
    const aiResponse = createCompleteAnalysisResult('Generated content', {
      result: 'Success',
      tokenUsage: { prompt: 10, completion: 20 },
      confidence: 0.95
    });

    mockAIService.analyze.mockResolvedValue(aiResponse);

    const result = await commandHandler.execute(command, context);

    expect(result).toHaveProperty('content');
    expect(mockCircuitBreakerStore.getBreaker).toHaveBeenCalledWith(
      'test-tenant-1',
      'ai-command.COMPLETE_TEXT'
    );
  });

  test('should execute non-AI command', async () => {
    const command = {
      type: 'SIMPLE_COMMAND',
      requiresAIAnalysis: false
    };

    const context: AICommandContext = {
      tenantId: 'test-tenant-1',
      documentId: 'doc-1'
    };

    const result = await commandHandler.execute(command, context);

    expect(result.result).toBeNull();
    expect(result.metadata.tokenUsage).toEqual({
      prompt: 0,
      completion: 0
    });
    expect(mockAIService.analyze).not.toHaveBeenCalled();
  });

  test('should handle AI service errors', async () => {
    const command = {
      type: 'ANALYZE_TEXT',
      requiresAIAnalysis: true
    };

    const context: AICommandContext = {
      tenantId: 'test-tenant-1',
      documentId: 'doc-1'
    };

    const error = new Error('AI service error');
    mockAIService.analyze.mockRejectedValue(error);

    await expect(commandHandler.execute(command, context))
      .rejects.toThrow('AI service error');

    expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
      'ai.command.error',
      expect.objectContaining({
        tenantId: 'test-tenant-1',
        commandType: 'ANALYZE_TEXT',
        errorType: 'Error'
      })
    );
  });

  test('should respect circuit breaker', async () => {
    const command = {
      type: 'ANALYZE_TEXT',
      requiresAIAnalysis: true
    };

    const context: AICommandContext = {
      tenantId: 'test-tenant-1',
      documentId: 'doc-1'
    };

    mockCircuitBreaker.execute.mockRejectedValue(
      new Error('Circuit breaker is open')
    );

    await expect(commandHandler.execute(command, context))
      .rejects.toThrow('Circuit breaker is open');

    expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
      'ai.command.error',
      expect.objectContaining({
        tenantId: 'test-tenant-1',
        commandType: 'ANALYZE_TEXT'
      })
    );
  });

  describe('command validation and parameters', () => {
    test('should validate required context parameters', async () => {
      const command = {
        type: 'ANALYZE_TEXT',
        requiresAIAnalysis: true,
        contextParameters: {
          windowSize: -100, // Invalid window size
          includePreceding: true,
          includeFollowing: true,
          includeDocument: true
        }
      };

      const context: AICommandContext = {
        tenantId: 'test-tenant-1',
        documentId: 'doc-1'
      };

      await expect(commandHandler.execute(command, context))
        .rejects.toThrow('Invalid window size');
    });

    test('should respect execution parameters timeouts', async () => {
      const command = {
        type: 'ANALYZE_TEXT',
        requiresAIAnalysis: true,
        executionParameters: {
          timeout: 100 // 100ms timeout
        }
      };

      const context: AICommandContext = {
        tenantId: 'test-tenant-1',
        documentId: 'doc-1'
      };

      // Mock a slow AI service response
      mockAIService.analyze.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );

      await expect(commandHandler.execute(command, context))
        .rejects.toThrow('Command execution timeout');

      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.timeout',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'ANALYZE_TEXT'
        })
      );
    });
  });

  describe('retry behavior', () => {
    test('should retry failed commands according to policy', async () => {
      const command = {
        type: 'ANALYZE_TEXT',
        requiresAIAnalysis: true,
        executionParameters: {
          retries: 2,
          retryDelay: 100
        }
      };

      const context: AICommandContext = {
        tenantId: 'test-tenant-1',
        documentId: 'doc-1'
      };

      mockAIService.analyze
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValueOnce({
          result: 'Success after retry',
          tokenUsage: { prompt: 10, completion: 5 }
        });

      const result = await commandHandler.execute(command, context);

      expect(result.result).toBe('Success after retry');
      expect(mockAIService.analyze).toHaveBeenCalledTimes(3);
      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.retry',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'ANALYZE_TEXT',
          attempt: 2
        })
      );
    });
  });

  describe('resource management', () => {
    test('should track resource usage', async () => {
      const command = {
        type: 'ANALYZE_TEXT',
        requiresAIAnalysis: true,
        executionParameters: {
          resourceLimits: {
            maxTokens: 1000,
            maxLatency: 500
          }
        }
      };

      const context: AICommandContext = {
        tenantId: 'test-tenant-1',
        documentId: 'doc-1'
      };

      mockAIService.analyze.mockResolvedValue({
        result: 'Success',
        tokenUsage: { prompt: 800, completion: 300 }, // Exceeds maxTokens
        metadata: { latency: 100 }
      });

      await expect(commandHandler.execute(command, context))
        .rejects.toThrow('Token limit exceeded');

      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.resource.tokens',
        1100,
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'ANALYZE_TEXT'
        })
      );
    });
  });
});