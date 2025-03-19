import { AIAnalysisParameters, AIAnalysisResult } from './AICommandRegistry';
import { DocumentContext } from './ContextProvider';
import { getTenantContext } from '../lib/tenant-context';
import { generateCommandCacheKey, shouldCacheResult, getCacheExpiry, trackTokenUsage } from './tokenUtils';
import { CircuitBreaker } from '../lib/circuit-breaker';
import { MetricsCollector } from '../metrics/metrics-collector';
import { FeatureFlagService } from '../lib/feature-flags';
import { ContentFilterPipeline } from '../compliance/filter-pipeline';
import { TokenLimiter } from './token-limiter';
import { TenantAISettings } from './tenant-ai-settings';

/**
 * Interface for AI provider service
 */
export interface AIProvider {
  getCompletion(prompt: string, options: any): Promise<{
    text: string;
    totalTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
    modelId: string;
  }>;
}

/**
 * Service for performing AI analysis on document contexts
 */
export class AIService {
  constructor(
    private aiProvider: AIProvider,
    private circuitBreaker: CircuitBreaker,
    private metricsCollector: MetricsCollector,
    private featureFlags: FeatureFlagService,
    private tokenLimiter: TokenLimiter,
    private filterPipeline: ContentFilterPipeline,
    private tenantSettings: TenantAISettings,
    private redisClient?: any // Use your Redis client type
  ) {}
  
  /**
   * Analyze document context using AI
   */
  async analyze(
    context: DocumentContext,
    parameters?: AIAnalysisParameters
  ): Promise<AIAnalysisResult> {
    if (!parameters) {
      throw new Error('Analysis parameters are required');
    }
    
    if (!context.tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }
    
    const operationId = this.generateOperationId();
    const startTime = performance.now();
    
    this.metricsCollector.incrementCounter('ai.analysis.started', {
      tenantId: context.tenantContext.tenantId,
      operationType: parameters.type
    });
    
    try {
      // Check if feature is enabled for this tenant
      const featureName = `ai-command.${parameters.type}`;
      const isEnabled = await this.featureFlags.isEnabled(
        featureName,
        context.tenantContext.tenantId
      );
      
      if (!isEnabled) {
        throw new Error(`AI command type ${parameters.type} is not enabled for this tenant`);
      }
      
      // Get tenant-specific model preference
      const modelId = await this.tenantSettings.getModelPreference(
        context.tenantContext.tenantId,
        parameters.type,
        parameters.model
      );
      
      // Check cache first if enabled
      if (parameters.cache !== false) {
        try {
          const cachedResult = await this.getCachedResult(context, parameters);
          if (cachedResult) {
            // Track cache hit metrics
            this.metricsCollector.incrementCounter('ai.analysis.cache.hit', {
              tenantId: context.tenantContext.tenantId,
              operationType: parameters.type
            });
            
            return cachedResult;
          }
        } catch (error) {
          console.warn('Cache retrieval error:', error);
          // Continue with fresh analysis if cache fails
        }
      }
      
      // Check token usage limits
      const estimatedTokens = this.estimateTokens(context, parameters);
      await this.tokenLimiter.checkAndReserveTokens(
        context.tenantContext.tenantId,
        estimatedTokens
      );
      
      // Prepare prompt with tenant-specific customizations
      const prompt = await this.preparePrompt(context, parameters);
      
      // Filter prompt through content filter
      const filterResult = await this.filterPipeline.process(prompt);
      if (filterResult.result === 'BLOCKED') {
        throw new Error(`Content filter blocked prompt: ${filterResult.reason}`);
      }
      
      // Set model options
      const options = {
        model: modelId,
        temperature: parameters.temperature || 0.7,
        maxTokens: parameters.maxTokens || 500
      };
      
      // Execute AI operation through circuit breaker
      const response = await this.circuitBreaker.execute(async () => {
        return this.aiProvider.getCompletion(prompt, options);
      });
      
      // Filter result through content filter
      const responseFilterResult = await this.filterPipeline.process(response.text);
      if (responseFilterResult.result === 'BLOCKED') {
        throw new Error(`Content filter blocked AI response: ${responseFilterResult.reason}`);
      }
      
      // Calculate response time for metrics
      const responseTime = performance.now() - startTime;
      
      // Create result with metadata
      const result: AIAnalysisResult = {
        content: response.text,
        modelId: options.model,
        totalTokens: response.totalTokens || 0,
        promptTokens: response.promptTokens,
        completionTokens: response.completionTokens,
        metadata: {
          responseTime,
          operationId,
          parameters: { ...parameters },
          promptLength: prompt.length
        }
      };
      
      // Track token usage
      trackTokenUsage(
        result.totalTokens,
        parameters.type,
        result.modelId
      );
      
      // Record metrics
      this.metricsCollector.recordValue('ai.analysis.duration', responseTime, {
        tenantId: context.tenantContext.tenantId,
        operationType: parameters.type,
        model: result.modelId
      });
      
      this.metricsCollector.recordValue('ai.analysis.tokens', result.totalTokens, {
        tenantId: context.tenantContext.tenantId,
        operationType: parameters.type,
        model: result.modelId
      });
      
      // Cache result if appropriate
      if (shouldCacheResult(parameters)) {
        try {
          await this.cacheResult(context, parameters, result);
          
          // Track cache storage metrics
          this.metricsCollector.incrementCounter('ai.analysis.cache.store', {
            tenantId: context.tenantContext.tenantId,
            operationType: parameters.type
          });
        } catch (error) {
          console.warn('Cache storage error:', error);
          // Continue even if caching fails
        }
      }
      
      return result;
    } catch (error) {
      // Track failure metrics
      this.metricsCollector.incrementCounter('ai.analysis.error', {
        tenantId: context.tenantContext.tenantId,
        operationType: parameters.type,
        errorType: error.name || 'unknown'
      });
      
      console.error('AI service error:', error);
      throw new Error(`AI analysis failed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Generate prompt for AI based on context and parameters
   */
  private async preparePrompt(
    context: DocumentContext, 
    parameters: AIAnalysisParameters
  ): Promise<string> {
    // Get tenant-specific prompt template if available
    let templateName = `${parameters.type.toLowerCase()}-template`;
    let systemInstruction: string;
    
    try {
      systemInstruction = await this.tenantSettings.getPromptTemplate(
        context.tenantContext?.tenantId || 'default',
        templateName
      );
    } catch (error) {
      // Fall back to generic template
      systemInstruction = `You are an AI assistant helping with document editing and analysis. You are working with tenant ${context.tenantContext?.tenantId}.`;
      
      // Add specific instructions based on analysis type
      switch (parameters.type) {
        case 'ANALYZE_SENTIMENT':
          systemInstruction += ' Analyze the sentiment of the provided text.';
          break;
        case 'SUGGEST_IMPROVEMENTS':
          systemInstruction += ' Suggest improvements for the provided text.';
          break;
        case 'CHECK_GRAMMAR':
          systemInstruction += ' Check the grammar and spelling of the provided text.';
          break;
        case 'COMPLETE_TEXT':
          systemInstruction += ' Complete the text in a natural way that follows the existing style.';
          break;
        case 'REWRITE_SELECTION':
          systemInstruction += ' Rewrite the selected text following the provided instructions.';
          break;
        // Add other analysis types as needed
        default:
          // Use custom instruction if provided
          if (parameters.instruction) {
            systemInstruction += ` ${parameters.instruction}`;
          }
      }
    }
    
    // Combine system instruction with context
    let prompt = `${systemInstruction}\n\n`;
    
    // Add document metadata if available
    if (context.documentMetadata && Object.keys(context.documentMetadata).length > 0) {
      prompt += `Document Metadata:\n${JSON.stringify(context.documentMetadata, null, 2)}\n\n`;
    }
    
    // Add selected text (highest priority)
    if (context.selectedText) {
      prompt += `Selected Text:\n${context.selectedText}\n\n`;
    }
    
    // Add active section if available
    if (context.activeSectionContent) {
      prompt += `Current Section:\n${context.activeSectionContent}\n\n`;
    } else {
      // Otherwise add preceding and following text
      if (context.precedingText) {
        prompt += `Text before cursor:\n${context.precedingText}\n\n`;
      }
      
      if (context.followingText) {
        prompt += `Text after cursor:\n${context.followingText}\n\n`;
      }
    }
    
    // Add specific task from parameters
    prompt += parameters.prompt || 'Please analyze this text.';
    
    return prompt;
  }
  
  /**
   * Try to get cached result
   */
  private async getCachedResult(
    context: DocumentContext,
    parameters: AIAnalysisParameters
  ): Promise<AIAnalysisResult | null> {
    if (!this.redisClient) {
      return null;
    }
    
    const cacheKey = generateCommandCacheKey({ 
      type: parameters.type,
      documentId: context.documentMetadata?.id || 'unknown',
      userId: context.tenantContext?.userId || 'unknown',
      analysisParameters: parameters,
      requiresAIAnalysis: true,
      contextParameters: {}
    }, context);
    
    const cachedData = await this.redisClient.get(cacheKey);
    
    if (cachedData) {
      try {
        const result = JSON.parse(cachedData) as AIAnalysisResult;
        // Add cache hit metadata
        result.metadata = {
          ...(result.metadata || {}),
          cacheHit: true
        };
        return result;
      } catch (error) {
        console.warn('Cache parsing error:', error);
        return null;
      }
    }
    
    return null;
  }
  
  /**
   * Cache the analysis result
   */
  private async cacheResult(
    context: DocumentContext,
    parameters: AIAnalysisParameters,
    result: AIAnalysisResult
  ): Promise<void> {
    if (!this.redisClient) {
      return;
    }
    
    const cacheKey = generateCommandCacheKey({
      type: parameters.type,
      documentId: context.documentMetadata?.id || 'unknown',
      userId: context.tenantContext?.userId || 'unknown',
      analysisParameters: parameters,
      requiresAIAnalysis: true,
      contextParameters: {}
    }, context);
    
    const ttl = getCacheExpiry(parameters);
    
    await this.redisClient.set(
      cacheKey, 
      JSON.stringify(result),
      'EX',
      ttl
    );
  }
  
  /**
   * Estimate tokens for a given context and parameters
   */
  private estimateTokens(
    context: DocumentContext,
    parameters: AIAnalysisParameters
  ): number {
    let tokenEstimate = 0;
    
    // Base tokens for system instruction
    tokenEstimate += 100;
    
    // Tokens for document metadata
    if (context.documentMetadata) {
      tokenEstimate += JSON.stringify(context.documentMetadata).length / 4;
    }
    
    // Tokens for content
    if (context.selectedText) {
      tokenEstimate += context.selectedText.length / 4;
    }
    
    if (context.activeSectionContent) {
      tokenEstimate += context.activeSectionContent.length / 4;
    } else {
      if (context.precedingText) {
        tokenEstimate += context.precedingText.length / 4;
      }
      
      if (context.followingText) {
        tokenEstimate += context.followingText.length / 4;
      }
    }
    
    // Tokens for prompt
    if (parameters.prompt) {
      tokenEstimate += parameters.prompt.length / 4;
    }
    
    // Add completion token estimate
    tokenEstimate += parameters.maxTokens || 500;
    
    return Math.ceil(tokenEstimate);
  }
  
  /**
   * Generate a unique operation ID
   */
  private generateOperationId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
  }
}