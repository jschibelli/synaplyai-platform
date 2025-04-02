import { jest } from '@jest/globals';

/**
 * Mock implementation of CommandRegistry that can be instantiated with new
 */
export class CommandRegistryMock {
  commands = {};
  handlers = {};
  validators = [];
  eventStore: any;
  transactionManager: any;
  metricsCollector: any;

  constructor(eventStore?: any, transactionManager?: any, metricsCollector?: any) {
    this.eventStore = eventStore;
    this.transactionManager = transactionManager;
    this.metricsCollector = metricsCollector;
  }

  register = jest.fn().mockImplementation((commandType, handler, options = {}) => {
    return Promise.resolve({ commandType, handler });
  });

  addValidationRule = jest.fn();
  
  execute = jest.fn().mockResolvedValue("success");
  
  executeBatch = jest.fn().mockImplementation((commands) => {
    return Promise.all(commands.map(() => "success"));
  });
  
  validateCommand = jest.fn().mockReturnValue({ valid: true, errors: [] });
}

// Function to create the mock class
export function createCommandRegistryMock() {
  return CommandRegistryMock;
}

// Singleton instance for direct imports
export const commandRegistryMock = new CommandRegistryMock();

// Default export should be the class itself for "new CommandRegistry()" usage
export default CommandRegistryMock;