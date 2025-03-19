import { TenantContext } from '../tenant/TenantContext';
import { MetricsCollector } from '../services/metrics/MetricsCollector';
import { CircuitBreakerStore } from '../circuit-breaker/redis-store';

interface AICommandOptions {
  type: string;
  requiresAIAnalysis: boolean;
  contextParameters?: {
    windowSize: number;
    includePreceding: boolean;
    includeFollowing: boolean;
  };
  executionParameters?: {
    timeout: number;
    retries: number;
    priority: 'high' | 'normal' | 'low';
  };
}

export class AICommandRegistry {
  private commands = new Map<string, {
    handler: (params: any) => Promise<any>;
    options: AICommandOptions;
  }>();

  constructor(
    private tenantContext: TenantContext,
    private metricsCollector: MetricsCollector,
    private circuitBreakerStore: CircuitBreakerStore
  ) {}

  private async wrapWithCircuitBreaker<T>(
    commandType: string,
    handler: () => Promise<T>
  ): Promise<T> {
    const tenantId = this.tenantContext.getCurrentTenant();
    const circuitBreaker = await this.circuitBreakerStore.getBreaker(
      tenantId,
      `ai-command.${commandType}`
    );

    const startTime = performance.now();
    try {
      const result = await circuitBreaker.execute(handler);
      
      // Record success metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordValue('ai.command.duration', duration, {
        tenantId,
        commandType,
        status: 'success'
      });

      return result;
    } catch (error) {
      // Record failure metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordValue('ai.command.duration', duration, {
        tenantId,
        commandType,
        status: 'failure'
      });
      await this.metricsCollector.increment('ai.command.errors', {
        tenantId,
        commandType,
        errorType: error.name
      });

      throw error;
    }
  }

  async registerCommand<T extends AICommandOptions>(
    command: T,
    handler: (params: T) => Promise<any>
  ): Promise<void> {
    if (this.commands.has(command.type)) {
      throw new Error(`Command type ${command.type} is already registered`);
    }

    this.commands.set(command.type, {
      handler,
      options: command
    });
  }

  async executeCommand<T extends AICommandOptions>(
    command: T,
    params: any
  ): Promise<any> {
    const registeredCommand = this.commands.get(command.type);
    if (!registeredCommand) {
      throw new Error(`Command type ${command.type} is not registered`);
    }

    // Validate tenant context
    const tenantId = this.tenantContext.getCurrentTenant();
    if (!tenantId) {
      throw new Error('No tenant context available');
    }

    // Execute with circuit breaker protection
    return this.wrapWithCircuitBreaker(command.type, async () => {
      const startTime = performance.now();

      try {
        const result = await registeredCommand.handler({
          ...params,
          ...command,
          tenantId
        });

        // Record command-specific metrics
        const duration = performance.now() - startTime;
        await this.metricsCollector.recordValue(`ai.command.${command.type}.duration`, duration, {
          tenantId
        });

        return result;
      } catch (error) {
        // Record command-specific failure metrics
        await this.metricsCollector.increment(`ai.command.${command.type}.error`, {
          tenantId,
          errorType: error.name
        });

        throw error;
      }
    });
  }
}