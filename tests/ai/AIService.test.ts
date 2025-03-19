import { AIService } from '../../src/ai/AIService';
import { DocumentContext } from '../../src/ai/ContextProvider';
import { AIAnalysisParameters, AIAnalysisResult } from '../../src/ai/AICommandRegistry';
import { getTenantContext } from '../../src/lib/tenant-context';
import { generateCommandCacheKey } from '../../src/ai/tokenUtils';

// Mock dependencies
jest.mock('../../src/lib/tenant-context');
jest.mock('../../src/ai/tokenUtils');

describe('AIService', () => {
  // Mock dependencies
  const mockOpenAIService = {
    getCompletion: jest.fn()
  };
  
  const mockCircuitBreaker = {
    execute: jest.fn()
  };
  
  const mockMetricsCollector = {
    incrementCounter: jest.fn(),
    recordValue: jest.fn()
  };
  
  const mockFeatureFlags = {
    isEnabled: jest.fn()
  };
  
  const mockTokenLimiter = {
    checkAndReserveTokens: jest.fn()
  };
  
  const mockFilterPipeline = {
    process: jest.fn()
  };
  
  const mockTenantSettings = {
    getModelPreference: jest.fn(),
    getPromptTemplate: jest.fn()
  };
  
  const mockRedisClient = {
    get: jest.fn(),
    set: jest.fn()
  };

  // Test instance
  let aiService: AIService;
  
  // Common test data
  const testTenantId = 'test-tenant';
  const testUserId = 'test-user';
  const testDocumentId = 'doc-123';
  
  // Sample context with tenant information
  const testContext: DocumentContext = {
    precedingText: 'This is text before cursor.',
    selectedText: 'This is selected text.',
    followingText: 'This is text after cursor.',
    documentMetadata: { id: testDocumentId, title: 'Test Document' },
    tenantContext: { tenantId: testTenantId, userId: testUserId }
  };
  
  // Sample parameters
  const testParameters: AIAnalysisParameters = {
    type: 'TEST_ANALYSIS',
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 500
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Set up tenant context mock
    (getTenantContext as jest.Mock).mockReturnValue({
      tenantId: testTenantId,
      userId: testUserId
    });

    // Default mock implementations
    mockOpenAIService.getCompletion.mockResolvedValue({
      text: 'AI generated content',
      totalTokens: 150,
      promptTokens: 100,
      completionTokens: 50,
      modelId: 'gpt-4'
    });

    mockCircuitBreaker.execute.mockImplementation(async (fn) => {
      return fn();
    });

    mockFeatureFlags.isEnabled.mockResolvedValue(true);
    
    mockTokenLimiter.checkAndReserveTokens.mockResolvedValue(undefined);
    
    mockFilterPipeline.process.mockResolvedValue({
      result: 'ALLOWED',
      confidence: 1.0
    });
    
    mockTenantSettings.getModelPreference.mockResolvedValue('gpt-4');
    mockTenantSettings.getPromptTemplate.mockRejectedValue(new Error('No template found'));
    
    mockRedisClient.get.mockResolvedValue(null);
    mockRedisClient.set.mockResolvedValue('OK');
    
    (generateCommandCacheKey as jest.Mock).mockReturnValue('test-cache-key');
    
    // Create test instance
    aiService = new AIService(
      mockOpenAIService,
      mockCircuitBreaker,
      mockMetricsCollector,
      mockFeatureFlags,
      mockTokenLimiter,
      mockFilterPipeline,
      mockTenantSettings,
      mockRedisClient
    );
  });

  describe('analyze', () => {
    test('should throw error when no tenant context available', async () => {
      // Remove tenant context from document context
      const contextWithoutTenant = { ...testContext, tenantContext: undefined };
      
      // Attempt to analyze
      await expect(aiService.analyze(contextWithoutTenant, testParameters))
        .rejects.toThrow('No tenant context available');
      
      // Verify no AI call was made
      expect(mockOpenAIService.getCompletion).not.toHaveBeenCalled();
    });

    test('should check if feature is enabled for tenant', async () => {
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify feature flag was checked
      expect(mockFeatureFlags.isEnabled).toHaveBeenCalledWith(
        `ai-command.${testParameters.type}`,
        testTenantId
      );
    });

    test('should throw error when feature is disabled', async () => {
      // Mock feature being disabled
      mockFeatureFlags.isEnabled.mockResolvedValue(false);
      
      // Attempt to analyze
      await expect(aiService.analyze(testContext, testParameters))
        .rejects.toThrow(`AI command type ${testParameters.type} is not enabled for this tenant`);
      
      // Verify no AI call was made
      expect(mockOpenAIService.getCompletion).not.toHaveBeenCalled();
    });

    test('should check token limits before analysis', async () => {
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify token limits were checked
      expect(mockTokenLimiter.checkAndReserveTokens).toHaveBeenCalledWith(
        testTenantId,
        expect.any(Number)
      );
    });

    test('should throw error when token limit exceeded', async () => {
      // Mock token limit exceeded
      mockTokenLimiter.checkAndReserveTokens.mockRejectedValue(
        new Error('Token usage limit exceeded for this tenant')
      );
      
      // Attempt to analyze
      await expect(aiService.analyze(testContext, testParameters))
        .rejects.toThrow('Token usage limit exceeded for this tenant');
      
      // Verify no AI call was made
      expect(mockOpenAIService.getCompletion).not.toHaveBeenCalled();
    });

    test('should filter prompt through content filter', async () => {
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify filter was applied to prompt
      expect(mockFilterPipeline.process).toHaveBeenCalledTimes(1);
      expect(mockFilterPipeline.process.mock.calls[0][0]).toContain(testContext.selectedText);
    });

    test('should throw error when prompt is blocked by filter', async () => {
      // Mock filter blocking content
      mockFilterPipeline.process.mockResolvedValueOnce({
        result: 'BLOCKED',
        confidence: 0.95,
        reason: 'Contains prohibited content'
      });
      
      // Attempt to analyze
      await expect(aiService.analyze(testContext, testParameters))
        .rejects.toThrow('Content filter blocked prompt: Contains prohibited content');
      
      // Verify no AI call was made
      expect(mockOpenAIService.getCompletion).not.toHaveBeenCalled();
    });

    test('should execute AI operation through circuit breaker', async () => {
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify circuit breaker was used
      expect(mockCircuitBreaker.execute).toHaveBeenCalledTimes(1);
    });

    test('should filter AI response through content filter', async () => {
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify filter was applied to response
      expect(mockFilterPipeline.process).toHaveBeenCalledTimes(2);
      expect(mockFilterPipeline.process.mock.calls[1][0]).toBe('AI generated content');
    });

    test('should throw error when response is blocked by filter', async () => {
      // Allow prompt but block response
      mockFilterPipeline.process
        .mockResolvedValueOnce({ result: 'ALLOWED', confidence: 1.0 })
        .mockResolvedValueOnce({ 
          result: 'BLOCKED', 
          confidence: 0.9, 
          reason: 'Response contains prohibited content' 
        });
      
      // Attempt to analyze
      await expect(aiService.analyze(testContext, testParameters))
        .rejects.toThrow('Content filter blocked AI response: Response contains prohibited content');
    });

    test('should track token usage', async () => {
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify metrics were recorded
      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.analysis.tokens', 
        150, 
        expect.objectContaining({
          tenantId: testTenantId,
          operationType: testParameters.type,
          model: 'gpt-4'
        })
      );
    });

    test('should return proper result structure', async () => {
      // Analyze with valid context
      const result = await aiService.analyze(testContext, testParameters);
      
      // Verify result structure
      expect(result).toMatchObject({
        content: 'AI generated content',
        modelId: 'gpt-4',
        totalTokens: 150,
        promptTokens: 100,
        completionTokens: 50,
        metadata: expect.objectContaining({
          responseTime: expect.any(Number),
          operationId: expect.any(String),
          parameters: expect.objectContaining(testParameters)
        })
      });
    });

    describe('caching', () => {
      test('should check cache before executing AI operation', async () => {
        // Analyze with valid context
        await aiService.analyze(testContext, testParameters);
        
        // Verify cache was checked
        expect(mockRedisClient.get).toHaveBeenCalledWith('test-cache-key');
      });

      test('should return cached result when available', async () => {
        // Mock cached result
        const cachedResult = {
          content: 'Cached AI content',
          modelId: 'gpt-4',
          totalTokens: 150,
          metadata: { cachedResult: true }
        };
        
        mockRedisClient.get.mockResolvedValue(JSON.stringify(cachedResult));
        
        // Analyze with valid context
        const result = await aiService.analyze(testContext, testParameters);
        
        // Verify cached result was returned
        expect(result.content).toBe('Cached AI content');
        expect(result.metadata).toHaveProperty('cacheHit', true);
        
        // Verify no AI call was made
        expect(mockOpenAIService.getCompletion).not.toHaveBeenCalled();
        
        // Verify cache hit was tracked
        expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
          'ai.analysis.cache.hit',
          expect.objectContaining({
            tenantId: testTenantId,
            operationType: testParameters.type
          })
        );
      });

      test('should cache result after successful analysis', async () => {
        // Analyze with valid context
        await aiService.analyze(testContext, testParameters);
        
        // Verify result was cached
        expect(mockRedisClient.set).toHaveBeenCalledWith(
          'test-cache-key',
          expect.any(String),
          'EX',
          expect.any(Number)
        );
        
        // Verify cache storage was tracked
        expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
          'ai.analysis.cache.store',
          expect.objectContaining({
            tenantId: testTenantId,
            operationType: testParameters.type
          })
        );
      });

      test('should not cache result when cache is disabled in parameters', async () => {
        // Analyze with cache disabled
        await aiService.analyze(testContext, { ...testParameters, cache: false });
        
        // Verify result was not cached
        expect(mockRedisClient.set).not.toHaveBeenCalled();
      });

      test('should handle cache errors gracefully', async () => {
        // Mock cache error
        mockRedisClient.get.mockRejectedValue(new Error('Redis connection failed'));
        
        // Analyze should still work despite cache error
        const result = await aiService.analyze(testContext, testParameters);
        
        // Verify result is still returned
        expect(result.content).toBe('AI generated content');
      });
    });

    describe('error handling', () => {
      test('should handle AI provider errors', async () => {
        // Mock AI provider error
        mockCircuitBreaker.execute.mockRejectedValue(new Error('AI provider error'));
        
        // Attempt to analyze
        await expect(aiService.analyze(testContext, testParameters))
          .rejects.toThrow('AI analysis failed: AI provider error');
        
        // Verify error was tracked
        expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
          'ai.analysis.error',
          expect.objectContaining({
            tenantId: testTenantId,
            operationType: testParameters.type,
            errorType: expect.any(String)
          })
        );
      });

      test('should handle token limiter errors', async () => {
        // Mock token limiter error
        mockTokenLimiter.checkAndReserveTokens.mockRejectedValue(new Error('Token limit exceeded'));
        
        // Attempt to analyze
        await expect(aiService.analyze(testContext, testParameters))
          .rejects.toThrow('Token limit exceeded');
        
        // Verify error was tracked
        expect(mockMetricsCollector.incrementCounter).toHaveBeenCalledWith(
          'ai.analysis.error',
          expect.objectContaining({
            tenantId: testTenantId,
            operationType: testParameters.type,
            errorType: expect.any(String)
          })
        );
      });
    });
  });

  describe('prompt preparation', () => {
    test('should use tenant-specific prompt template when available', async () => {
      // Mock tenant-specific template
      mockTenantSettings.getPromptTemplate.mockResolvedValue(
        'Custom template for tenant {{tenantId}}'
      );
      
      // Analyze with valid context
      await aiService.analyze(testContext, testParameters);
      
      // Verify template was retrieved
      expect(mockTenantSettings.getPromptTemplate).toHaveBeenCalledWith(
        testTenantId,
        `${testParameters.type.toLowerCase()}-template`
      );
      
      // Verify AI call used the template
      expect(mockOpenAIService.getCompletion.mock.calls[0][0])
        .toContain('Custom template for tenant');
    });

    test('should include document metadata in prompt when available', async () => {
      // Analyze with valid context that includes metadata
      await aiService.analyze(testContext, testParameters);
      
      // Verify prompt includes metadata
      const promptArg = mockOpenAIService.getCompletion.mock.calls[0][0];
      expect(promptArg).toContain('Document Metadata');
      expect(promptArg).toContain('Test Document');
    });

    test('should include selected text in prompt when available', async () => {
      // Analyze with valid context that includes selected text
      await aiService.analyze(testContext, testParameters);
      
      // Verify prompt includes selected text
      const promptArg = mockOpenAIService.getCompletion.mock.calls[0][0];
      expect(promptArg).toContain('Selected Text');
      expect(promptArg).toContain('This is selected text.');
    });

    test('should include preceding and following text when no selection', async () => {
      // Context without selected text
      const contextWithoutSelection = {
        ...testContext,
        selectedText: undefined
      };
      
      // Analyze with context without selection
      await aiService.analyze(contextWithoutSelection, testParameters);
      
      // Verify prompt includes preceding and following text
      const promptArg = mockOpenAIService.getCompletion.mock.calls[0][0];
      expect(promptArg).toContain('Text before cursor');
      expect(promptArg).toContain('Text after cursor');
    });

    test('should include active section when available', async () => {
      // Context with active section
      const contextWithActiveSection = {
        ...testContext,
        selectedText: undefined,
        activeSectionContent: 'This is the active section content.'
      };
      
      // Analyze with context with active section
      await aiService.analyze(contextWithActiveSection, testParameters);
      
      // Verify prompt includes active section
      const promptArg = mockOpenAIService.getCompletion.mock.calls[0][0];
      expect(promptArg).toContain('Current Section');
      expect(promptArg).toContain('This is the active section content.');
    });

    test('should include custom prompt from parameters', async () => {
      // Parameters with custom prompt
      const paramsWithPrompt = {
        ...testParameters,
        prompt: 'Custom analysis instruction: please analyze tone and style.'
      };
      
      // Analyze with custom prompt
      await aiService.analyze(testContext, paramsWithPrompt);
      
      // Verify prompt includes custom instruction
      const promptArg = mockOpenAIService.getCompletion.mock.calls[0][0];
      expect(promptArg).toContain('Custom analysis instruction');
    });
  });
});