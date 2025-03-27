/**
 * Type definitions for enhanced Jest mocks with proper TypeScript typing
 * This solves the "mockResolvedValue does not exist" TypeScript errors
 */

/**
 * Represents a fully typed Jest mock function with all chainable mock methods
 */
export type TypedMock<T extends (...args: any[]) => any> = jest.Mock<ReturnType<T>, Parameters<T>> & {
  mockImplementation: (fn: T) => TypedMock<T>;
  mockImplementationOnce: (fn: T) => TypedMock<T>;
  mockResolvedValue: <V>(value: V) => TypedMock<T>;
  mockResolvedValueOnce: <V>(value: V) => TypedMock<T>;
  mockRejectedValue: <E extends Error>(error: E) => TypedMock<T>;
  mockRejectedValueOnce: <E extends Error>(error: E) => TypedMock<T>;
  mockReturnValue: <V>(value: V) => TypedMock<T>;
  mockReturnValueOnce: <V>(value: V) => TypedMock<T>;
  mockReset: () => TypedMock<T>;
  mockClear: () => TypedMock<T>;
  mockRestore: () => TypedMock<T>;
  mock: {
    calls: Array<Parameters<T>>;
    results: Array<{type: string; value: any}>;
    instances: any[];
    contexts: any[];
    lastCall: Parameters<T> | undefined;
    invocationCallOrder: number[]; // Add this missing property
  };
};

/**
 * Creates a properly typed Jest mock function with all chaining methods
 * 
 * @param implementation Optional implementation function
 * @returns A Jest mock with proper TypeScript typings for all methods
 */
export function createTypedMock<T extends (...args: any[]) => any>(
  implementation?: T
): TypedMock<T> {
  const mock = jest.fn(implementation) as TypedMock<T>;
  
  // Set up chainable mock methods
  mock.mockImplementation = jest.fn().mockReturnValue(mock) as any;
  mock.mockImplementationOnce = jest.fn().mockReturnValue(mock) as any;
  mock.mockResolvedValue = jest.fn().mockReturnValue(mock) as any;
  mock.mockResolvedValueOnce = jest.fn().mockReturnValue(mock) as any;
  mock.mockRejectedValue = jest.fn().mockReturnValue(mock) as any;
  mock.mockRejectedValueOnce = jest.fn().mockReturnValue(mock) as any;
  mock.mockReturnValue = jest.fn().mockReturnValue(mock) as any;
  mock.mockReturnValueOnce = jest.fn().mockReturnValue(mock) as any;
  mock.mockReset = jest.fn().mockReturnValue(mock) as any;
  mock.mockClear = jest.fn().mockReturnValue(mock) as any;
  mock.mockRestore = jest.fn().mockReturnValue(mock) as any;
  
  // Set up mock object with the missing invocationCallOrder property
  mock.mock = {
    calls: [],
    results: [],
    instances: [],
    contexts: [],
    lastCall: undefined,
    invocationCallOrder: [] // Add this missing property
  };
  
  return mock;
}