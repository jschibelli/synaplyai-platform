import { TenantContext } from '../tenant/TenantContext';
import { MetricsCollector } from '../services/metrics/MetricsCollector';
import { CircuitBreakerStore } from '../circuit-breaker/redis-store';
import { AIService } from '../services/ai/AIService';

export interface AICommandContext {
  tenantId: string;
  documentId: string;
  precedingText?: string;
  followingText?: string;
  selectedText?: string;
  metadata?: Record<string, any>;
}

export interface AICommandResult<T = any> {
  result: T;
  metadata: {
    duration: number;
    tokenUsage?: {
      prompt: number;
      completion: number;
    };
    modelId?: string;
    confidence?: number;
  };
}

export class AICommandHandler {
  constructor(
    private tenantContext: TenantContext,
    private metricsCollector: MetricsCollector,
    private circuitBreakerStore: CircuitBreakerStore,
    private aiService: AIService
  ) {}

  async execute<T>(
    command: {
      type: string;
      requiresAIAnalysis: boolean;
      contextParameters?: {
        windowSize: number;
        includePreceding: boolean;
        includeFollowing: boolean;
      };
      executionParameters?: {
        timeout?: number;
        retries?: number;
        priority?: 'high' | 'normal' | 'low';
      };
    },
    context: AICommandContext
  ): Promise<AICommandResult<T>> {
    const startTime = performance.now();
    const tenantId = this.tenantContext.getCurrentTenant();

    try {
      // Get circuit breaker for this command type
      const breaker = await this.circuitBreakerStore.getBreaker(
        tenantId,
        `ai-command.${command.type}`
      );

      // Execute with circuit breaker protection
      const result = await breaker.execute(async () => {
        if (command.requiresAIAnalysis) {
          return this.aiService.analyze(context, command);
        }
        return this.executeWithoutAI(command, context);
      });

      // Record success metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordValue('ai.command.duration', duration, {
        tenantId,
        commandType: command.type,
        status: 'success'
      });

      return {
        result,
        metadata: {
          duration,
          tokenUsage: result.tokenUsage,
          modelId: result.modelId,
          confidence: result.confidence
        }
      };

    } catch (error) {
      // Record failure metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.increment('ai.command.error', {
        tenantId,
        commandType: command.type,
        errorType: error.name
      });

      throw error;
    }
  }

  private async executeWithoutAI(command: any, context: AICommandContext): Promise<any> {
    // Handle non-AI commands
    return {
      result: null,
      tokenUsage: { prompt: 0, completion: 0 },
      modelId: null,
      confidence: 1.0
    };
  }
}