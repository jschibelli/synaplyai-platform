import '@testing-library/jest-dom';
import { ReactNode } from 'react';
import { CircuitState } from './src/lib/circuit-breaker';
import { createMetricsCollectorMock } from './src/__mocks__/metrics-collector.mock';
import { createCircuitBreakerMock } from './src/__mocks__/circuit-breaker.mock';
import { createCommandRegistryMock } from './src/__mocks__/command-registry.mock';
import { createDocumentEditorMock } from './src/__mocks__/document-editor.mock';
import { MockWebSocket } from './__mocks__/websocket.mock';

import { cleanup } from '@testing-library/react';

// Make sure DOM matchers are available in tests
expect.extend({
  toBeInTheDocument(received) {
    const { isNot, utils } = this;
    return {
      pass: received !== null && received !== undefined && received.ownerDocument && received.ownerDocument.contains(received),
      message: () => `Expected element ${isNot ? 'not ' : ''}to be in the document`
    };
  },
  toHaveClass(received, className) {
    const { isNot, utils } = this;
    const pass = received && received.classList && received.classList.contains(className);
    return {
      pass,
      message: () => `Expected element ${isNot ? 'not ' : ''}to have class "${className}"`
    };
  }
});

// Export cleanup for use in tests
global.cleanup = cleanup;

// Extend the global namespace with our test helpers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeInTheDocument(): R;
      toHaveClass(className: string): R;
      toHaveStyle(style: Record<string, any>): R;
      toHaveAttribute(attr: string, value?: string): R;
      toHaveTextContent(text: string | RegExp): R;
      toHaveAccessibleName(): R;
    }
  }
  
  var mockMetricsCollector: ReturnType<typeof createMetricsCollectorMock>;
  var mockCircuitBreaker: ReturnType<typeof createCircuitBreakerMock>;
  var CommandRegistry: ReturnType<typeof createCommandRegistryMock>;
  var tenantContextStorage: {
    run: jest.Mock;
  };
  var cleanup: () => void;  // ✅ Define by function signature instead of self-reference
  
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

// Set up additional matchers for DOM testing
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});