import { MetricsCollector } from '../../metrics/collector';
import { getCurrentTenantContext } from '../../lib/tenant-context';

export interface Command {
  type: string;
  payload: any;
  tenantId?: string;
  userId?: string;
}

export interface CommandHandler<T = any> {
  validate(command: Command): Promise<boolean>;
  execute(command: Command): Promise<T>;
  authorize?(command: Command): Promise<boolean>;
}

export class CommandRegistry {
  private handlers = new Map<string, CommandHandler>();
  private metricsCollector: MetricsCollector;

  constructor(metricsCollector: MetricsCollector) {
    this.metricsCollector = metricsCollector;
  }

  register<T>(type: string, handler: CommandHandler<T>): void {
    if (this.handlers.has(type)) {
      throw new Error(`Handler already registered for command type: ${type}`);
    }
    this.handlers.set(type, handler);
  }

  async execute<T>(command: Command): Promise<T> {
    const startTime = performance.now();
    const tenantContext = getCurrentTenantContext();

    if (!tenantContext?.tenantId) {
      throw new Error('No tenant context available');
    }

    try {
      const handler = this.handlers.get(command.type);
      if (!handler) {
        throw new Error(`No handler registered for command type: ${command.type}`);
      }

      // Authorization check
      if (handler.authorize) {
        const isAuthorized = await handler.authorize(command);
        if (!isAuthorized) {
          throw new Error('Not authorized to execute command');
        }
      }

      // Validation
      const isValid = await handler.validate(command);
      if (!isValid) {
        throw new Error('Command validation failed');
      }

      // Execution
      const result = await handler.execute(command);

      // Record metrics
      const duration = performance.now() - startTime;
      await this.metricsCollector.recordLatency('command.execution', duration);
      await this.metricsCollector.increment(`command.${command.type}.success`, tenantContext.tenantId);

      return result;
    } catch (error) {
      // Record error metrics
      await this.metricsCollector.increment(`command.${command.type}.error`, tenantContext.tenantId);
      throw error;
    }
  }

  async executeBatch<T>(commands: Command[]): Promise<T[]> {
    const results: T[] = [];
    for (const command of commands) {
      results.push(await this.execute(command));
    }
    return results;
  }
}