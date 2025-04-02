import { jest } from '@jest/globals';

/**
 * Mock implementation of CommandRegistry
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
  
  execute = jest.fn().mockImplementation(() => Promise.resolve("success"));
  
  executeBatch = jest.fn().mockImplementation((commands) => {
    return Promise.all(commands.map(() => Promise.resolve("success")));
  });
  
  validateCommand = jest.fn().mockReturnValue({ valid: true, errors: [] });
}

// Export the class as default
export default CommandRegistryMock;