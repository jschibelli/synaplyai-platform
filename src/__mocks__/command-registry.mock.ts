import { createTypedMock } from './jest-mock-extensions';

/**
 * Creates a properly typed command registry mock
 */
export function createCommandRegistryMock() {
  const executeMock = createTypedMock().mockResolvedValue({
    success: true,
    result: {}
  });
  
  return {
    register: createTypedMock().mockReturnValue({
      execute: executeMock
    }),
    execute: executeMock,
    hasCommand: createTypedMock().mockReturnValue(true),
    getCommandHandler: createTypedMock().mockReturnValue({
      execute: executeMock
    })
  };
}

// Add mock implementation for CommandRegistry.register
jest.mock('../commands/CommandRegistry', () => ({
  CommandRegistry: {
    register: jest.fn(),
    execute: jest.fn(),
    // Other methods
  }
}));