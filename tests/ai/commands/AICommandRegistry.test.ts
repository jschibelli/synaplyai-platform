import { AICommandRegistry } from '../../../src/ai/commands/AICommandRegistry';
import { TenantContext } from '../../../src/tenant/TenantContext';
import { MetricsCollector } from '../../../src/services/metrics/MetricsCollector';
import { RedisCircuitBreakerStore } from '../../../src/circuit-breaker/redis-store';
import { CircuitBreaker } from '../../../src/circuit-breaker/interfaces';

describe('AICommandRegistry', () => {
  let aiCommandRegistry: AICommandRegistry;
  let mockTenantContext: jest.Mocked<TenantContext>;
  let mockMetricsCollector: jest.Mocked<MetricsCollector>;
  let mockCircuitBreakerStore: jest.Mocked<CircuitBreakerStore>;
  let mockCircuitBreaker: jest.Mocked<CircuitBreaker>;

  beforeEach(() => {
    // Setup mock circuit breaker
    mockCircuitBreaker = {
      execute: jest.fn().mockImplementation((fn) => fn())
    } as any;

    // Setup mock dependencies
    mockTenantContext = {
      getCurrentTenant: jest.fn().mockReturnValue('test-tenant-1')
    } as any;

    mockMetricsCollector = {
      recordValue: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined)
    } as any;

    mockCircuitBreakerStore = {
      getBreaker: jest.fn().mockResolvedValue(mockCircuitBreaker)
    } as any;

    aiCommandRegistry = new AICommandRegistry(
      mockTenantContext,
      mockMetricsCollector,
      mockCircuitBreakerStore
    );
  });

  describe('registerCommand', () => {
    test('should register a command successfully', async () => {
      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };
      const handler = jest.fn();

      await aiCommandRegistry.registerCommand(command, handler);

      // Try executing the registered command
      const params = { input: 'test' };
      await aiCommandRegistry.executeCommand(command, params);

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          ...params,
          ...command,
          tenantId: 'test-tenant-1'
        })
      );
    });

    test('should prevent duplicate command registration', async () => {
      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };

      await aiCommandRegistry.registerCommand(command, jest.fn());

      await expect(
        aiCommandRegistry.registerCommand(command, jest.fn())
      ).rejects.toThrow('Command type TEST_COMMAND is already registered');
    });
  });

  describe('executeCommand', () => {
    test('should execute command with circuit breaker protection', async () => {
      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };
      const handler = jest.fn().mockResolvedValue('success');

      await aiCommandRegistry.registerCommand(command, handler);
      const result = await aiCommandRegistry.executeCommand(command, {});

      expect(result).toBe('success');
      expect(mockCircuitBreakerStore.getBreaker).toHaveBeenCalledWith(
        'test-tenant-1',
        'ai-command.TEST_COMMAND'
      );
      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.TEST_COMMAND.duration',
        expect.any(Number),
        expect.objectContaining({
          tenantId: 'test-tenant-1'
        })
      );
    });

    test('should handle command execution failures', async () => {
      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };
      const error = new Error('Test error');
      const handler = jest.fn().mockRejectedValue(error);

      await aiCommandRegistry.registerCommand(command, handler);

      await expect(
        aiCommandRegistry.executeCommand(command, {})
      ).rejects.toThrow('Test error');

      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.TEST_COMMAND.error',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          errorType: 'Error'
        })
      );
    });

    test('should validate tenant context', async () => {
      mockTenantContext.getCurrentTenant.mockReturnValue(null);

      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };

      await expect(
        aiCommandRegistry.executeCommand(command, {})
      ).rejects.toThrow('No tenant context available');
    });

    test('should track command duration metrics', async () => {
      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };
      const handler = jest.fn().mockResolvedValue('success');

      await aiCommandRegistry.registerCommand(command, handler);
      await aiCommandRegistry.executeCommand(command, {});

      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.duration',
        expect.any(Number),
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'TEST_COMMAND',
          status: 'success'
        })
      );
    });
  });

  describe('command validation and timeouts', () => {
    test('should timeout long-running commands', async () => {
      const command = {
        type: 'SLOW_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          timeout: 100 // 100ms timeout
        }
      };

      const handler = jest.fn().mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 200))
      );

      await aiCommandRegistry.registerCommand(command, handler);

      await expect(
        aiCommandRegistry.executeCommand(command, {})
      ).rejects.toThrow('Command execution timeout');

      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.timeout',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'SLOW_COMMAND'
        })
      );
    });
  });

  describe('circuit breaker behavior', () => {
    test('should handle circuit breaker open state', async () => {
      mockCircuitBreaker.execute.mockRejectedValueOnce(
        new Error('Circuit breaker is open')
      );

      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true
      };
      const handler = jest.fn();

      await aiCommandRegistry.registerCommand(command, handler);

      await expect(
        aiCommandRegistry.executeCommand(command, {})
      ).rejects.toThrow('Circuit breaker is open');

      expect(handler).not.toHaveBeenCalled();
      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'circuit_breaker.rejection',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'TEST_COMMAND'
        })
      );
    });
  });

  describe('rate limiting', () => {
    test('should enforce rate limits', async () => {
      const command = {
        type: 'TEST_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          rateLimit: {
            maxRequests: 2,
            windowMs: 1000
          }
        }
      };
      const handler = jest.fn().mockResolvedValue('success');

      await aiCommandRegistry.registerCommand(command, handler);

      // First two calls should succeed
      await aiCommandRegistry.executeCommand(command, {});
      await aiCommandRegistry.executeCommand(command, {});

      // Third call should fail
      await expect(
        aiCommandRegistry.executeCommand(command, {})
      ).rejects.toThrow('Rate limit exceeded');

      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'rate_limit.exceeded',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'TEST_COMMAND'
        })
      );
    });
  });

  describe('parallel command execution', () => {
    test('should execute commands in parallel within concurrency limits', async () => {
      const command = {
        type: 'PARALLEL_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          concurrencyLimit: 2,
          timeout: 1000
        }
      };

      const executionTimes: number[] = [];
      const handler = jest.fn().mockImplementation(async () => {
        const startTime = Date.now();
        await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
        executionTimes.push(Date.now() - startTime);
        return 'success';
      });

      await aiCommandRegistry.registerCommand(command, handler);

      // Execute 4 commands that should run in 2 batches
      const results = await Promise.all([
        aiCommandRegistry.executeCommand(command, { id: 1 }),
        aiCommandRegistry.executeCommand(command, { id: 2 }),
        aiCommandRegistry.executeCommand(command, { id: 3 }),
        aiCommandRegistry.executeCommand(command, { id: 4 })
      ]);

      // Verify all commands completed successfully
      expect(results).toHaveLength(4);
      results.forEach(result => expect(result).toBe('success'));

      // Verify concurrency limit was respected
      const executionBatches = executionTimes.reduce((acc, time) => {
        const batch = Math.floor(time / 100);
        acc[batch] = (acc[batch] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);

      // Should have 2 batches with max 2 commands each
      Object.values(executionBatches).forEach(count => {
        expect(count).toBeLessThanOrEqual(2);
      });

      // Verify metrics were recorded
      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.parallel.batch_size',
        expect.any(Number),
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'PARALLEL_COMMAND'
        })
      );
    });

    test('should handle errors in parallel execution', async () => {
      const command = {
        type: 'PARALLEL_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          concurrencyLimit: 2
        }
      };

      const handler = jest.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('Parallel execution error'))
        .mockResolvedValueOnce('success');

      await aiCommandRegistry.registerCommand(command, handler);

      const results = await Promise.allSettled([
        aiCommandRegistry.executeCommand(command, { id: 1 }),
        aiCommandRegistry.executeCommand(command, { id: 2 }),
        aiCommandRegistry.executeCommand(command, { id: 3 })
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
      expect(results[2].status).toBe('fulfilled');

      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.parallel.error',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'PARALLEL_COMMAND'
        })
      );
    });
  });

  describe('resource management', () => {
    test('should cleanup resources after command execution', async () => {
      const command = {
        type: 'RESOURCE_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          cleanupRequired: true
        }
      };

      const cleanup = jest.fn();
      const handler = jest.fn().mockImplementation(async () => {
        return { result: 'success', cleanup };
      });

      await aiCommandRegistry.registerCommand(command, handler);
      await aiCommandRegistry.executeCommand(command, {});

      expect(cleanup).toHaveBeenCalled();
    });

    test('should handle cleanup failures gracefully', async () => {
      const command = {
        type: 'RESOURCE_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          cleanupRequired: true
        }
      };

      const cleanup = jest.fn().mockRejectedValue(new Error('Cleanup failed'));
      const handler = jest.fn().mockResolvedValue({ 
        result: 'success', 
        cleanup 
      });

      await aiCommandRegistry.registerCommand(command, handler);
      const result = await aiCommandRegistry.executeCommand(command, {});

      expect(result).toBe('success');
      expect(cleanup).toHaveBeenCalled();
      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.cleanup.error',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'RESOURCE_COMMAND',
          errorType: 'Error'
        })
      );
    });

    test('should track resource usage metrics', async () => {
      const command = {
        type: 'RESOURCE_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          resourceLimits: {
            maxMemoryMB: 100,
            maxTokens: 1000
          }
        }
      };

      const handler = jest.fn().mockImplementation(async () => {
        return {
          result: 'success',
          resourceUsage: {
            memoryMB: 50,
            tokens: 500
          }
        };
      });

      await aiCommandRegistry.registerCommand(command, handler);
      await aiCommandRegistry.executeCommand(command, {});

      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.resource.memory',
        50,
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'RESOURCE_COMMAND'
        })
      );

      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.resource.tokens',
        500,
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'RESOURCE_COMMAND'
        })
      );
    });
  });

  describe('command priority handling', () => {
    test('should execute high priority commands before low priority', async () => {
      const executionOrder: string[] = [];

      const lowPriorityCmd = {
        type: 'LOW_PRIORITY',
        requiresAIAnalysis: true,
        executionParameters: {
          priority: 'low'
        }
      };

      const highPriorityCmd = {
        type: 'HIGH_PRIORITY',
        requiresAIAnalysis: true,
        executionParameters: {
          priority: 'high'
        }
      };

      const lowHandler = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push('low');
        return 'low done';
      });

      const highHandler = jest.fn().mockImplementation(async () => {
        executionOrder.push('high');
        return 'high done';
      });

      await aiCommandRegistry.registerCommand(lowPriorityCmd, lowHandler);
      await aiCommandRegistry.registerCommand(highPriorityCmd, highHandler);

      const results = await Promise.all([
        aiCommandRegistry.executeCommand(lowPriorityCmd, {}),
        aiCommandRegistry.executeCommand(highPriorityCmd, {})
      ]);

      expect(executionOrder).toEqual(['high', 'low']);
      expect(mockMetricsCollector.recordValue).toHaveBeenCalledWith(
        'ai.command.priority.order',
        expect.any(Number),
        expect.objectContaining({
          priority: 'high'
        })
      );
    });
  });

  describe('command retry behavior', () => {
    test('should retry failed commands according to policy', async () => {
      const command = {
        type: 'RETRY_COMMAND',
        requiresAIAnalysis: true,
        executionParameters: {
          retries: 2,
          retryDelay: 100
        }
      };

      const handler = jest.fn()
        .mockRejectedValueOnce(new Error('First failure'))
        .mockRejectedValueOnce(new Error('Second failure'))
        .mockResolvedValue('success');

      await aiCommandRegistry.registerCommand(command, handler);
      const result = await aiCommandRegistry.executeCommand(command, {});

      expect(result).toBe('success');
      expect(handler).toHaveBeenCalledTimes(3);
      expect(mockMetricsCollector.increment).toHaveBeenCalledWith(
        'ai.command.retry',
        expect.objectContaining({
          tenantId: 'test-tenant-1',
          commandType: 'RETRY_COMMAND',
          attempt: 2
        })
      );
    });
  });
});

const command: AICommandOptions = {
  type: 'SOME_COMMAND',
  requiresAIAnalysis: true,
  executionParameters: {
    timeout: 1000,
    retries: 3,
    priority: 'high'
  }
};