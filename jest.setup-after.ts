/// <reference path="./jest.setup-mocks.ts" />
import '@testing-library/jest-dom';
import { ReactNode } from 'react';
import { CircuitState } from './src/lib/circuit-breaker';
import { createMetricsCollectorMock } from './src/__mocks__/metrics-collector.mock';
// Import the interface from the mock file directly
import { MockCircuitBreaker, createCircuitBreakerMock } from './__mocks__/circuit-breaker.mock';
import { createCommandRegistryMock } from './src/__mocks__/command-registry.mock';
import { createDocumentEditorMock } from './src/__mocks__/document-editor.mock';
import { MockWebSocket } from './__mocks__/websocket.mock';

import { cleanup } from '@testing-library/react';
import { createMockMetricsCollector } from './jest.setup-mocks';

// Make sure DOM matchers are available in tests
expect.extend({
  toBeInTheDocument(received) {
    const { isNot, utils } = this;
    return {
      pass: received !== null && received !== undefined && received.ownerDocument && received.ownerDocument.contains(received),
      message: () => `Expected element ${isNot ? 'not ' : ''}to be in the document`
    };
  },
});

// Add appropriate afterEach cleanup
afterEach(() => {
  cleanup();
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
  
  // IMPORTANT: Reference MockCircuitBreaker from imported module
  var mockCircuitBreaker: MockCircuitBreaker;
  var CommandRegistry: ReturnType<typeof createCommandRegistryMock>;
  var tenantContextStorage: {
    run: jest.Mock;
  };
  var cleanup: () => void;  // ✅ Define by function signature instead of self-reference
  
  // Add these to fix the global index signature errors
  var createMockDocument: (props?: any) => any;
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
global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

// Mock document editor with proper type annotations
jest.mock('./src/components/editor/DocumentEditor', () => ({
  DocumentEditor: createDocumentEditorMock()
}));

// FIXED: Mock CommandRegistry with proper Promise implementation
jest.mock('./src/collaboration/commands/CommandRegistry', () => ({
  CommandRegistry: {
    register: jest.fn().mockImplementation((commandType, handler, options) => {
      // Return a Promise.resolve() that has a catch method
      return Promise.resolve().then(() => {
        return { commandType, handler };
      });
    }),
    addValidationRule: jest.fn(),
    execute: jest.fn().mockResolvedValue("success"),
    executeBatch: jest.fn().mockImplementation((commands) => {
      return Promise.all(commands.map(() => "success"));
    }),
    validateCommand: jest.fn().mockReturnValue({ valid: true, errors: [] })
  }
}));

// FIX: Create a proper Prisma mock with all required models
jest.mock('@prisma/client', () => {
  // Create a mock function that properly supports mockResolvedValue
  const createPrismaMock = () => {
    const mockFn = jest.fn();
    
    // Attach proper mock methods directly
    mockFn.mockResolvedValue = jest.fn().mockResolvedValue;
    mockFn.mockResolvedValueOnce = jest.fn().mockResolvedValueOnce;
    mockFn.mockRejectedValue = jest.fn().mockRejectedValue;
    mockFn.mockRejectedValueOnce = jest.fn().mockRejectedValueOnce;
    mockFn.mockImplementation = jest.fn().mockImplementation;
    mockFn.mockImplementationOnce = jest.fn().mockImplementationOnce;
    
    return mockFn;
  };

  // Create a full model mock with all methods used in tests
  const createModelMock = () => ({
    findUnique: createPrismaMock(),
    findFirst: createPrismaMock(),
    findMany: createPrismaMock(),
    create: createPrismaMock(),
    createMany: createPrismaMock(),
    update: createPrismaMock(),
    updateMany: createPrismaMock(),
    upsert: createPrismaMock(),
    delete: createPrismaMock(),
    deleteMany: createPrismaMock(),
    count: createPrismaMock(),
    aggregate: createPrismaMock(),
    groupBy: createPrismaMock()
  });

  const prismaClient = {
    user: createModelMock(),
    document: createModelMock(),
    event: createModelMock(),
    snapshot: createModelMock(),
    complianceLog: createModelMock(),
    complianceAudit: createModelMock(),
    conflict: createModelMock(),
    subscription: createModelMock(),
    tenantSettings: createModelMock(),
    usageMetrics: createModelMock(),
    
    // Prisma client methods
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn().mockImplementation(async (cb) => {
      if (typeof cb === 'function') {
        return await cb(prismaClient);
      }
      return Promise.all(cb);
    }),
    $use: jest.fn()
  };

  return {
    PrismaClient: jest.fn(() => prismaClient)
  };
});

// Expose CommandRegistry in global
global.CommandRegistry = createCommandRegistryMock();

// Add the helper functions that tests are using
global.createMockDocument = jest.fn().mockImplementation((props = {}) => ({
  id: props.id || 'doc-123',
  content: props.content || 'Test document content',
  version: props.version || 1,
  metadata: props.metadata || {},
  userId: props.userId || 'user-1',
  tenantId: props.tenantId || 'tenant-1',
  createdAt: props.createdAt || new Date(),
  updatedAt: props.updatedAt || new Date()
}));

// Fix the generateRandomOperations mock to include id property
global.generateRandomOperations = jest.fn().mockImplementation((document, count = 2) => {
  return Array(count || 2).fill(0).map((_, i) => ({
    id: `op-${i}`, // Add ID to fix DocumentEvent compatibility
    position: i * 5,
    insert: `text${i}`,
    delete: i + 1
  }));
});

// Mock tenant context storage
global.tenantContextStorage = {
  run: jest.fn().mockImplementation((context, fn) => fn())
};

// Create properly typed global mock objects
global.mockCircuitBreaker = createCircuitBreakerMock();

// Mock ComplianceLogger for tests
jest.mock('./src/compliance/logger', () => ({
  ComplianceLogger: {
    initialize: jest.fn(),
    log: jest.fn().mockResolvedValue(undefined),
    generateEvidenceHash: jest.fn().mockReturnValue('mock-hash-123'),
    verifyLogIntegrity: jest.fn().mockResolvedValue(true),
    validateLogs: jest.fn().mockResolvedValue([]) // Add missing method
  }
}));

// Fix the useWebSocket hook for tests
jest.mock('./src/hooks/useWebSocket', () => ({
  useWebSocket: jest.fn().mockImplementation((url = '/socket') => ({
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn(),
    // Add these to fix ConflictContext.tsx errors
    on: jest.fn(),
    off: jest.fn(),
    emit: jest.fn()
  }))
}));

// Create AICommandContext module to fix imports
jest.mock('./src/ai/AICommandContext', () => {
  return {
    AICommandContext: {
      defaultContext: {
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'tenant-1',
        document: {
          content: 'test content',
          metadata: {}
        }
      }
    },
    AICommandContextParameters: {
      defaultParameters: {
        windowSize: 100,
        includePreceding: true,
        includeFollowing: true,
        includeDocument: true
      }
    }
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