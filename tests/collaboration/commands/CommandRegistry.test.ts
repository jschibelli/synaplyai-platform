import { CommandRegistry } from '../../../src/collaboration/commands/CommandRegistry';
import { EventStore } from '../../../src/collaboration/events/EventStore';
import { TransactionManager } from '../../../src/collaboration/transactions/TransactionManager';
import { MetricsCollector } from '../../../src/metrics/collector';
import { Command, CommandResult } from '../../../src/collaboration/commands/types';
import { ComplianceLogger } from '../../../src/compliance/logger';

// Mock dependencies
jest.mock('../../../src/collaboration/events/EventStore');
jest.mock('../../../src/collaboration/transactions/TransactionManager');
jest.mock('../../../src/metrics/collector');
jest.mock('../../../src/compliance/logger', () => ({
  ComplianceLogger: {
    log: jest.fn().mockResolvedValue(undefined)
  }
}));
jest.mock('../../../src/lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ tenantId: 'test-tenant', userId: 'test-user' })
}));

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let eventStore: jest.Mocked<EventStore>;
  let transactionManager: jest.Mocked<TransactionManager>;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    eventStore = {
      appendEvent: jest.fn().mockResolvedValue({}),
      getEvents: jest.fn().mockResolvedValue([])
    } as unknown as jest.Mocked<EventStore>;
    
    transactionManager = {
      executeInTransaction: jest.fn().mockImplementation((fn) => fn({}))
    } as unknown as jest.Mocked<TransactionManager>;
    
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
      recordValue: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create registry
    registry = new CommandRegistry(eventStore, transactionManager, metricsCollector);
  });
  
  describe('register', () => {
    test('should register a command handler', () => {
      // Create handler
      const handler = jest.fn();
      
      // Register handler
      registry.register('TEST_COMMAND', handler);
      
      // Verify registration
      expect(registry.getRegisteredCommandTypes()).toContain('TEST_COMMAND');
    });
    
    test('should throw error when registering duplicate handler', () => {
      // Register first handler
      registry.register('TEST_COMMAND', jest.fn());
      
      // Attempt to register duplicate
      expect(() => {
        registry.register('TEST_COMMAND', jest.fn());
      }).toThrow();
    });
    
    test('should register with validator and schema version', () => {
      const handler = jest.fn();
      const validator = jest.fn().mockResolvedValue({ valid: true });
      const schemaVersion = { version: '1.0', schemaHash: 'abc123' };
      
      registry.register('TEST_COMMAND', handler, {
        validator,
        schemaVersion
      });
      
      expect(registry.getRegisteredCommandTypes()).toContain('TEST_COMMAND');
      expect(registry.getSchemaVersion('TEST_COMMAND')).toEqual(schemaVersion);
    });
  });
  
  describe('addValidationRule', () => {
    test('should add validation rule for registered command', () => {
      // Register command
      registry.register('TEST_COMMAND', jest.fn());
      
      // Add validation rule
      const validationFn = jest.fn().mockResolvedValue({ valid: true });
      registry.addValidationRule('TEST_COMMAND', validationFn);
      
      // No exception should be thrown
      expect(() => {}).not.toThrow();
    });
    
    test('should throw error when adding rule for unregistered command', () => {
      // Attempt to add validation rule for unregistered command
      const validationFn = jest.fn().mockResolvedValue({ valid: true });
      
      expect(() => {
        registry.addValidationRule('UNKNOWN_COMMAND', validationFn);
      }).toThrow();
    });
  });
  
  describe('execute', () => {
    test('should execute registered command handler', async () => {
      // Create command and result
      const command: Command = {
        type: 'TEST_COMMAND',
        payload: { documentId: 'doc-1', data: 'test' },
        userId: 'user-1'
      };
      
      const expectedResult: CommandResult = {
        success: true,
        data: { id: 'result-1' }
      };
      
      // Create handler
      const handler = jest.fn().mockResolvedValue(expectedResult);
      
      // Register handler
      registry.register('TEST_COMMAND', handler);
      
      // Execute command
      const result = await registry.execute(command);
      
      // Verify handler was called
      expect(handler).toHaveBeenCalledWith(command, 'test-tenant');
      
      // Verify transaction was used
      expect(transactionManager.executeInTransaction).toHaveBeenCalled();
      
      // Verify result
      expect(result).toEqual(expectedResult);
      
      // Verify metrics
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'command.execute.TEST_COMMAND',
        expect.any(Number)
      );
      
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'command.executed.TEST_COMMAND',
        1
      );
    });
    
    test('should run validation rules before execution', async () => {
      // Create command
      const command: Command = {
        type: 'TEST_COMMAND',
        payload: { documentId: 'doc-1', data: 'test' },
        userId: 'user-1'
      };
      
      // Create handler
      const handler = jest.fn().mockResolvedValue({ success: true });
      
      // Create validation rules
      const validRule = jest.fn().mockResolvedValue({ valid: true });
      const invalidRule = jest.fn().mockResolvedValue({ valid: false, reason: 'Invalid data' });
      
      // Register handler with rules
      registry.register('TEST_COMMAND', handler);
      registry.addValidationRule('TEST_COMMAND', validRule);
      
      // Execute with valid rule
      await registry.execute(command);
      
      // Verify handler was called after validation
      expect(validRule).toHaveBeenCalledWith(command);
      expect(handler).toHaveBeenCalled();
      
      // Reset mocks
      handler.mockClear();
      validRule.mockClear();
      
      // Add invalid rule
      registry.addValidationRule('TEST_COMMAND', invalidRule);
      
      // Execute with invalid rule
      await expect(registry.execute(command)).rejects.toThrow('Command validation failed');
      
      // Verify handler was not called
      expect(validRule).toHaveBeenCalledWith(command);
      expect(invalidRule).toHaveBeenCalledWith(command);
      expect(handler).not.toHaveBeenCalled();
      
      // Verify failure metric
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'command.validation.failed.TEST_COMMAND',
        1
      );
    });
    
    test('should throw error when executing unregistered command', async () => {
      // Create command
      const command: Command = {
        type: 'UNKNOWN_COMMAND',
        payload: { documentId: 'doc-1', data: 'test' },
        userId: 'user-1'
      };
      
      // Attempt to execute
      await expect(registry.execute(command)).rejects.toThrow();
    });
    
    test('should record metrics on failure', async () => {
      // Create command
      const command: Command = {
        type: 'TEST_COMMAND',
        payload: { documentId: 'doc-1', data: 'test' },
        userId: 'user-1'
      };
      
      // Create failing handler
      const handler = jest.fn().mockRejectedValue(new Error('Test error'));
      
      // Register handler
      registry.register('TEST_COMMAND', handler);
      
      // Execute command should throw
      await expect(registry.execute(command)).rejects.toThrow('Test error');
      
      // Verify error metrics were recorded
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'command.failed.TEST_COMMAND',
        1
      );
      
      // Verify compliance logging
      expect(ComplianceLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'command.execution.failed',
          resourceId: 'doc-1'
        })
      );
    });
  });
  
  describe('executeBatch', () => {
    test('should execute multiple commands in a single transaction', async () => {
      // Create commands
      const commands: Command[] = [
        {
          type: 'COMMAND_1',
          payload: { documentId: 'doc-1', data: 'test1' },
          userId: 'user-1'
        },
        {
          type: 'COMMAND_2',
          payload: { documentId: 'doc-1', data: 'test2' },
          userId: 'user-1'
        }
      ];
      
      // Create handlers
      const handler1 = jest.fn().mockResolvedValue({ success: true, data: 'result1' });
      const handler2 = jest.fn().mockResolvedValue({ success: true, data: 'result2' });
      
      // Register handlers
      registry.register('COMMAND_1', handler1);
      registry.register('COMMAND_2', handler2);
      
      // Execute batch
      const results = await registry.executeBatch(commands);
      
      // Verify single transaction was used
      expect(transactionManager.executeInTransaction).toHaveBeenCalledTimes(1);
      
      // Verify both handlers were called
      expect(handler1).toHaveBeenCalledWith(commands[0], 'test-tenant');
      expect(handler2).toHaveBeenCalledWith(commands[1], 'test-tenant');
      
      // Verify results
      expect(results).toEqual([
        { success: true, data: 'result1' },
        { success: true, data: 'result2' }
      ]);
      
      // Verify metrics
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'command.batch.execute',
        expect.any(Number)
      );
      expect(metricsCollector.recordValue).toHaveBeenCalledWith(
        'command.batch.size',
        2
      );
    });
    
    test('should handle empty command array', async () => {
      const results = await registry.executeBatch([]);
      expect(results).toEqual([]);
      expect(transactionManager.executeInTransaction).not.toHaveBeenCalled();
    });
    
    test('should roll back transaction on validation failure', async () => {
      // Create commands
      const commands: Command[] = [
        {
          type: 'COMMAND_1',
          payload: { documentId: 'doc-1', data: 'test1' },
          userId: 'user-1'
        },
        {
          type: 'COMMAND_2',
          payload: { documentId: 'doc-1', data: 'invalid' },
          userId: 'user-1'
        }
      ];
      
      // Create handlers and validators
      const handler1 = jest.fn().mockResolvedValue({ success: true });
      const handler2 = jest.fn().mockResolvedValue({ success: true });
      const validator1 = jest.fn().mockResolvedValue({ valid: true });
      const validator2 = jest.fn().mockImplementation(cmd => {
        return Promise.resolve({
          valid: cmd.payload.data !== 'invalid',
          reason: 'Invalid data'
        });
      });
      
      // Register handlers with validators
      registry.register('COMMAND_1', handler1);
      registry.register('COMMAND_2', handler2);
      registry.addValidationRule('COMMAND_1', validator1);
      registry.addValidationRule('COMMAND_2', validator2);
      
      // Execute batch should fail
      await expect(registry.executeBatch(commands)).rejects.toThrow('Batch command validation failed');
      
      // Ensure transaction was attempted but no handlers were called
      expect(transactionManager.executeInTransaction).toHaveBeenCalledTimes(1);
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      
      // Verify failure metric
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'command.batch.failed',
        1
      );
    });
  });
});