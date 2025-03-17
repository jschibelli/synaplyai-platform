import { CommandAggregator } from '../../../src/collaboration/commands/CommandAggregator';
import { CommandRegistry } from '../../../src/collaboration/commands/CommandRegistry';
import { MetricsCollector } from '../../../src/metrics/collector';
import { DocumentCommand } from '../../../src/collaboration/commands/types';

// Mock dependencies
jest.mock('../../../src/collaboration/commands/CommandRegistry');
jest.mock('../../../src/metrics/collector');
jest.mock('../../../src/lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ tenantId: 'test-tenant', userId: 'test-user' })
}));

describe('CommandAggregator', () => {
  let aggregator: CommandAggregator;
  let commandRegistry: jest.Mocked<CommandRegistry>;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    commandRegistry = {
      execute: jest.fn().mockResolvedValue({ success: true }),
      executeBatch: jest.fn().mockResolvedValue([{ success: true }])
    } as unknown as jest.Mocked<CommandRegistry>;
    
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      recordValue: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create aggregator
    aggregator = new CommandAggregator(
      commandRegistry,
      metricsCollector,
      {
        maxBufferTimeMs: 50,
        maxBufferSize: 5
      }
    );
  });
  
  afterEach(() => {
    // Clean up
    aggregator.dispose();
    jest.clearAllMocks();
  });
  
  describe('bufferCommand', () => {
    test('should buffer and execute a single command', async () => {
      const command = {
        type: 'INSERT_TEXT',
        text: 'a',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      // Execute via aggregator
      const promise = aggregator.bufferCommand(command);
      
      // Force flush
      await aggregator.flushAll();
      
      // Verify promise resolved
      await expect(promise).resolves.toEqual({ success: true });
      
      // Verify command was executed
      expect(commandRegistry.execute).toHaveBeenCalledWith(command);
    });
    
    test('should aggregate sequential typing commands', async () => {
      const result = { success: true, data: { id: 'result-1' } };
      commandRegistry.execute.mockResolvedValue(result);
      
      // Buffer typing commands sequentially
      const cmd1 = {
        type: 'INSERT_TEXT',
        text: 'H',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      const cmd2 = {
        type: 'INSERT_TEXT',
        text: 'e',
        position: 1,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      const cmd3 = {
        type: 'INSERT_TEXT',
        text: 'l',
        position: 2,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      // Queue all commands
      const p1 = aggregator.bufferCommand(cmd1);
      const p2 = aggregator.bufferCommand(cmd2);
      const p3 = aggregator.bufferCommand(cmd3);
      
      // Force flush
      await aggregator.flushAll();
      
      // All promises should resolve with the same result
      await expect(p1).resolves.toEqual(result);
      await expect(p2).resolves.toEqual(result);
      await expect(p3).resolves.toEqual(result);
      
      // Verify commands were aggregated (only one execution)
      expect(commandRegistry.execute).toHaveBeenCalledTimes(1);
      
      // Verify the aggregated command
      expect(commandRegistry.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INSERT_TEXT',
          payload: expect.objectContaining({
            documentId: 'doc-1',
            position: 0,
            text: 'Hel' // Combined text
          })
        })
      );
      
      // Verify metrics
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'command.aggregated',
        3
      );
    });
    
    test('should not aggregate commands of different types', async () => {
      // Insert command
      const insertCmd = {
        type: 'INSERT_TEXT',
        text: 'Hello',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      // Format command
      const formatCmd = {
        type: 'FORMAT_TEXT',
        userId: 'test-user',
        payload: {
          documentId: 'doc-1',
          position: 0,
          length: 5,
          attributes: { bold: true }
        }
      };
      
      // Queue commands
      const p1 = aggregator.bufferCommand(insertCmd);
      const p2 = aggregator.bufferCommand(formatCmd);
      
      // Force flush
      await aggregator.flushAll();
      
      // Verify both commands were executed separately
      expect(commandRegistry.execute).toHaveBeenCalledTimes(2);
      expect(commandRegistry.execute).toHaveBeenCalledWith(insertCmd);
      expect(commandRegistry.execute).toHaveBeenCalledWith(formatCmd);
    });
  });
  
  describe('immediate execution', () => {
    test('should execute immediate commands without buffering', async () => {
      const command = {
        type: 'INSERT_TEXT',
        text: 'Hello',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' },
        metadata: { immediate: true }
      };
      
      // Execute command
      await aggregator.bufferCommand(command);
      
      // Verify it was executed immediately
      expect(commandRegistry.execute).toHaveBeenCalledTimes(1);
      expect(commandRegistry.execute).toHaveBeenCalledWith(command);
    });
    
    test('should skip buffering for large text inserts', async () => {
      // Create a large text command that should bypass buffering
      const largeText = 'a'.repeat(100); // 100 character text
      
      const command = {
        type: 'INSERT_TEXT',
        text: largeText,
        position: 0,
        userId: 'test-user',
        payload: { 
          documentId: 'doc-1',
          text: largeText // Also in payload
        }
      };
      
      // Execute command
      await aggregator.bufferCommand(command);
      
      // Verify it was executed immediately without buffering
      expect(commandRegistry.execute).toHaveBeenCalledTimes(1);
      expect(commandRegistry.execute).toHaveBeenCalledWith(command);
    });
  });
  
  describe('flushAll', () => {
    test('should flush all document buffers', async () => {
      // Insert commands for different documents
      const cmd1 = {
        type: 'INSERT_TEXT',
        text: 'a',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      const cmd2 = {
        type: 'INSERT_TEXT',
        text: 'b',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-2' }
      };
      
      // Queue commands
      const p1 = aggregator.bufferCommand(cmd1);
      const p2 = aggregator.bufferCommand(cmd2);
      
      // Should not have executed yet
      expect(commandRegistry.execute).not.toHaveBeenCalled();
      
      // Force flush all
      await aggregator.flushAll();
      
      // Verify both documents' commands were executed
      expect(commandRegistry.execute).toHaveBeenCalledTimes(2);
      
      // Wait for promises to resolve
      await Promise.all([p1, p2]);
    });
    
    test('should do nothing if no buffers exist', async () => {
      // Flush with no commands buffered
      await aggregator.flushAll();
      
      // Should not try to execute anything
      expect(commandRegistry.execute).not.toHaveBeenCalled();
    });
  });
  
  describe('error handling', () => {
    test('should reject all pending commands if execution fails', async () => {
      // Mock execution failure
      const error = new Error('Command execution failed');
      commandRegistry.execute.mockRejectedValue(error);
      
      // Queue commands
      const cmd1 = {
        type: 'INSERT_TEXT',
        text: 'a',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      const cmd2 = {
        type: 'INSERT_TEXT',
        text: 'b',
        position: 1,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      // Queue commands
      const p1 = aggregator.bufferCommand(cmd1);
      const p2 = aggregator.bufferCommand(cmd2);
      
      // Force flush (will fail)
      await expect(aggregator.flushAll()).rejects.toThrow('Command execution failed');
      
      // Both promises should be rejected with the same error
      await expect(p1).rejects.toThrow('Command execution failed');
      await expect(p2).rejects.toThrow('Command execution failed');
    });
    
    test('should handle invalid commands gracefully', async () => {
      // Create an invalid command (missing required fields)
      const invalidCommand = {
        type: 'INSERT_TEXT',
        userId: 'test-user'
        // Missing payload and other required fields
      } as unknown as DocumentCommand;
      
      // Queue command
      const promise = aggregator.bufferCommand(invalidCommand);
      
      // Force flush
      await aggregator.flushAll();
      
      // Should reject with validation error
      await expect(promise).rejects.toThrow();
    });
  });
  
  describe('auto-flushing', () => {
    test('should auto-flush when buffer reaches max size', async () => {
      // Fill buffer to max capacity (5 commands)
      const commands = [];
      const promises = [];
      
      for (let i = 0; i < 5; i++) {
        const cmd = {
          type: 'INSERT_TEXT',
          text: String.fromCharCode(97 + i), // 'a', 'b', 'c', etc.
          position: i,
          userId: 'test-user',
          payload: { documentId: 'doc-1' }
        };
        commands.push(cmd);
        promises.push(aggregator.bufferCommand(cmd));
      }
      
      // Wait a bit for auto-flush to trigger
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should have auto-flushed due to reaching max buffer size
      expect(commandRegistry.execute).toHaveBeenCalled();
      
      // Wait for all promises to resolve
      await Promise.all(promises);
    });
    
    test('should auto-flush after timeout', async () => {
      // Add a single command to the buffer
      const cmd = {
        type: 'INSERT_TEXT',
        text: 'a',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      };
      
      const promise = aggregator.bufferCommand(cmd);
      
      // Shouldn't have executed yet
      expect(commandRegistry.execute).not.toHaveBeenCalled();
      
      // Wait for auto-flush timeout (50ms in config + a little buffer)
      await new Promise(resolve => setTimeout(resolve, 70));
      
      // Should have auto-flushed due to timeout
      expect(commandRegistry.execute).toHaveBeenCalled();
      
      // Wait for promise to resolve
      await promise;
    });
  });
  
  describe('aggregation strategies', () => {
    test('should merge adjacent delete operations', async () => {
      // Setup delete operations
      const delete1 = {
        type: 'DELETE_TEXT',
        userId: 'test-user',
        payload: {
          documentId: 'doc-1',
          position: 5,
          length: 1
        }
      };
      
      const delete2 = {
        type: 'DELETE_TEXT',
        userId: 'test-user',
        payload: {
          documentId: 'doc-1',
          position: 4,
          length: 1
        }
      };
      
      // Queue delete commands
      const p1 = aggregator.bufferCommand(delete1);
      const p2 = aggregator.bufferCommand(delete2);
      
      // Force flush
      await aggregator.flushAll();
      
      // Verify aggregation
      expect(commandRegistry.execute).toHaveBeenCalledTimes(1);
      expect(commandRegistry.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DELETE_TEXT',
          payload: expect.objectContaining({
            position: 4,  // Should use lower position
            length: 2     // Combined length
          })
        })
      );
      
      // Wait for all promises to complete
      await Promise.all([p1, p2]);
    });
    
    test('should merge format operations with compatible attributes', async () => {
      // Setup format operations with complementary attributes
      const format1 = {
        type: 'FORMAT_TEXT',
        userId: 'test-user',
        payload: {
          documentId: 'doc-1',
          position: 0,
          length: 10,
          attributes: { bold: true }
        }
      };
      
      const format2 = {
        type: 'FORMAT_TEXT',
        userId: 'test-user',
        payload: {
          documentId: 'doc-1',
          position: 0,
          length: 10,
          attributes: { italic: true }
        }
      };
      
      // Queue format commands
      const p1 = aggregator.bufferCommand(format1);
      const p2 = aggregator.bufferCommand(format2);
      
      // Force flush
      await aggregator.flushAll();
      
      // Verify merged attributes
      expect(commandRegistry.execute).toHaveBeenCalledTimes(1);
      expect(commandRegistry.execute).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'FORMAT_TEXT',
          payload: expect.objectContaining({
            attributes: {
              bold: true,
              italic: true
            }
          })
        })
      );
      
      // Wait for all promises to complete
      await Promise.all([p1, p2]);
    });
  });
  
  describe('dispose', () => {
    test('should clean up resources on dispose', async () => {
      // Set up a spy on clearTimeout
      const originalClearTimeout = global.clearTimeout;
      global.clearTimeout = jest.fn();
      
      // Add some commands to buffer
      aggregator.bufferCommand({
        type: 'INSERT_TEXT',
        text: 'a',
        position: 0,
        userId: 'test-user',
        payload: { documentId: 'doc-1' }
      });
      
      // Call dispose
      aggregator.dispose();
      
      // Should have called clearTimeout
      expect(global.clearTimeout).toHaveBeenCalled();
      
      // Restore original clearTimeout
      global.clearTimeout = originalClearTimeout;
    });
  });
});