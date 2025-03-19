import { AICommandHandler } from '../AICommandRegistry';
import { TenantAISettings } from '../../settings/TenantAISettings';
import { AICommandParameters, AICommandResult, DocumentContext } from '../../types';
import { CircuitBreaker } from '../../../resilience/CircuitBreaker';
import { LoggerService } from '../../../services/LoggerService';
import { MetricsCollector } from '../../../metrics/MetricsCollector';

/**
 * Handles model-specific AI command execution with specialized prompts
 * and processing for different AI models
 */
export class ModelSpecificHandler<T extends AICommandParameters, R extends AICommandResult> {
  constructor(
    private baseHandler: AICommandHandler<T, R>,
    private tenantSettings: TenantAISettings,
    private circuitBreaker: CircuitBreaker,
    private logger: LoggerService,
    private metrics: MetricsCollector,
    private modelSpecificImplementations: Map<string, AICommandHandler<T, R>>
  ) {}

  /**
   * Executes the command with the appropriate model-specific handler
   */
  async execute(parameters: T, context: DocumentContext): Promise<R> {
    const startTime = performance.now();
    const tenantId = context.tenantContext.tenantId;

    try {
      // Get the preferred model for this operation type
      const modelId = await this.tenantSettings.getModelPreference(
        tenantId,
        parameters.type
      );

      this.logger.debug(`Selected model ${modelId} for operation ${parameters.type}`, {
        tenantId,
        operationType: parameters.type
      });

      // Check if we have a specialized handler for this model
      const handler = this.modelSpecificImplementations.get(modelId) || this.baseHandler;

      // Execute with circuit breaker for resilience
      const result = await this.circuitBreaker.execute(
        `ai.model.${modelId}`,
        () => handler.execute(parameters, context),
        { tenantId }
      );

      // Record successful execution
      this.metrics.recordValue(
        'ai.command.duration',
        performance.now() - startTime,
        { tenantId, operationType: parameters.type, modelId }
      );

      return result;
    } catch (error) {
      // Record failure
      this.metrics.incrementCounter('ai.command.error', {
        tenantId,
        operationType: parameters.type,
        errorType: error.name
      });

      throw error;
    }
  }
}