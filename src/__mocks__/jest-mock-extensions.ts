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
 * Creates a typed jest mock with proper typing
 */
export function createTypedMock<T = any>(): jest.Mock<T> {
  const mock = jest.fn() as jest.Mock<T>;
  
  // Properly type common mock methods
  mock.mockImplementation = jest.fn().mockImplementation;
  mock.mockImplementationOnce = jest.fn().mockImplementationOnce;
  mock.mockResolvedValue = jest.fn().mockResolvedValue;
  mock.mockResolvedValueOnce = jest.fn().mockResolvedValueOnce;
  mock.mockRejectedValue = jest.fn().mockRejectedValue;
  mock.mockRejectedValueOnce = jest.fn().mockRejectedValueOnce;
  
  return mock;
}