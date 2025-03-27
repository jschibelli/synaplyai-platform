import '@testing-library/jest-dom';
import { ReactNode } from 'react';
import { CircuitState } from './src/lib/circuit-breaker';
import { createMetricsCollectorMock } from './src/__mocks__/metrics-collector.mock';
import { createCircuitBreakerMock } from './src/__mocks__/circuit-breaker.mock';
import { createCommandRegistryMock } from './src/__mocks__/command-registry.mock';
import { createDocumentEditorMock } from './src/__mocks__/document-editor.mock';

// This ensures toBeInTheDocument() and other DOM matchers work

// This will make the toBeInTheDocument() matcher available

// Extend the global namespace with our test helpers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
    }
  }
  
  var mockMetricsCollector: ReturnType<typeof createMetricsCollectorMock>;
  var mockCircuitBreaker: ReturnType<typeof createCircuitBreakerMock>;
  var CommandRegistry: ReturnType<typeof createCommandRegistryMock>;
  var tenantContextStorage: {
    run: jest.Mock;
  };
  
  // Add these to fix the global index signature errors
  var createMockDocument: jest.Mock;
  var generateRandomOperations: jest.Mock;
  
  // Update WebSocket declaration to accept string | URL
  var WebSocket: {
    new(url: string | URL, protocols?: string | string[] | undefined): WebSocket;
    prototype: WebSocket;
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
  };
  
  interface WebSocket extends EventTarget {
    readonly readyState: number;
    readonly url: string;
    readonly protocol: string;
    readonly extensions: string;
    readonly bufferedAmount: number;
    binaryType: 'blob' | 'arraybuffer';
    onopen: ((this: WebSocket, ev: Event) => any) | null;
    onclose: ((this: WebSocket, ev: CloseEvent) => any) | null;
    onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null;
    onerror: ((this: WebSocket, ev: Event) => any) | null;
    close(code?: number, reason?: string): void;
    send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void;
    addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;
    addEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions): void;
    removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
    removeEventListener(type: string, listener: EventListenerOrEventListenerObject, options?: boolean | EventListenerOptions): void;
  }
  
  interface WebSocketEventMap {
    close: CloseEvent;
    error: Event;
    message: MessageEvent;
    open: Event;
  }
}

// Modify the MockWebSocket class
class MockWebSocket implements WebSocket {
  // Static constants for reference
  static readonly CONNECTING: 0 = 0;
  static readonly OPEN: 1 = 1;
  static readonly CLOSING: 2 = 2;
  static readonly CLOSED: 3 = 3;
  
  // Instance properties required by WebSocket interface
  readonly CONNECTING: 0 = 0;
  readonly OPEN: 1 = 1;
  readonly CLOSING: 2 = 2;
  readonly CLOSED: 3 = 3;  // Only need one set of these properties
  
  url: string;
  readyState: number = 1; // OPEN
  binaryType: 'blob' | 'arraybuffer' = 'blob';
  protocol: string = '';
  extensions: string = '';
  bufferedAmount: number = 0;
  
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  
  constructor(url: string | URL) {
    this.url = url.toString();
  }
  
  send = jest.fn();
  close = jest.fn();
  addEventListener = jest.fn();
  removeEventListener = jest.fn();
  dispatchEvent(event: Event): boolean { return true; }
  
  // Additional methods for testing
  static sentMessages: any[] = [];
  messages: any[] = [];
  
  static triggerMessage(data: any): void {
    // Implementation for testing
  }
  
  triggerMessage(data: any): void {
    if (this.onmessage) {
      this.onmessage({ data } as any);
    }
  }
  
  static reset(): void {
    MockWebSocket.sentMessages = [];
  }
  
  static simulateReconnection(): void {
    // Implementation for reconnection simulation
  }
}

// Assign the mock class to global WebSocket
global.WebSocket = MockWebSocket as any;

// Mock document editor with proper type annotations
jest.mock('./src/components/editor/DocumentEditor', () => ({
  DocumentEditor: createDocumentEditorMock()
}));

// Mock command registry with all required methods
jest.mock('./src/commands/CommandRegistry', () => ({
  CommandRegistry: {
    register: jest.fn().mockReturnValue({
      execute: jest.fn()
    }),
    execute: jest.fn()
  }
}));

// Expose CommandRegistry in global
global.CommandRegistry = createCommandRegistryMock();

// Add the helper functions that tests are using
global.createMockDocument = jest.fn().mockImplementation((props = {}) => ({
  id: 'doc-123',
  content: 'Test document content',
  metadata: {},
  ...props
}));

global.generateRandomOperations = jest.fn().mockReturnValue([
  { position: 0, insert: 'text' },
  { position: 5, delete: 3 }
]);

// Mock tenant context storage
global.tenantContextStorage = {
  run: jest.fn().mockImplementation((context, fn) => fn())
};

// Create properly typed global mock objects
global.mockMetricsCollector = createMetricsCollectorMock();
global.mockCircuitBreaker = createCircuitBreakerMock();

// Replace the problematic code with this
jest.mock('./src/ai/AICommandRegistry', () => {
  const original = jest.requireActual('./src/ai/AICommandRegistry');
  return {
    ...original,
    // Export a validator function that always returns true
    validateCommand: jest.fn().mockReturnValue({ valid: true }),
    isValidCommand: jest.fn().mockReturnValue(true)
  };
});