/// <reference path="./jest.setup-mocks.ts" />
import '@testing-library/jest-dom';
import { ReactNode } from 'react';
import { CircuitState } from './src/lib/circuit-breaker';
import { createCircuitBreakerMock, MockCircuitBreaker } from './__mocks__/circuit-breaker.mock';
import { createCommandRegistryMock } from './src/__mocks__/command-registry.mock';
import { createDocumentEditorMock } from './src/__mocks__/document-editor.mock';
import { MockWebSocket } from './__mocks__/websocket.mock';
import { cleanup } from '@testing-library/react';
import { createMockMetricsCollector, createTestConflict, createMockDocument } from './jest.setup-mocks';
import { MetricsCollectorMock } from './__mocks__/metrics-collector.mock';

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

// Make the type declarations match jest.setup-mocks.ts
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
  
  // Match types with those in jest.setup-mocks.ts
  var mockMetricsCollector: MetricsCollectorMock;
  var mockCircuitBreaker: MockCircuitBreaker;
  var createMockMetricsCollector: (props?: any) => MetricsCollectorMock;
  var createTestConflict: (props?: any) => any;
  var createMockDocument: (props?: any) => any;
  var MockWebSocket: new () => any;
  
  // Additional globals
  var CommandRegistry: ReturnType<typeof createCommandRegistryMock>;
  var tenantContextStorage: {
    run: jest.Mock;
    getTenantContext: jest.Mock;
    setTenantContext: jest.Mock;
    clearTenantContext: jest.Mock;
  };
  var cleanup: () => void;
  var generateRandomOperations: jest.Mock;
  var WebSocket: {
    new(url: string | URL, protocols?: string | string[] | undefined): WebSocket;
    prototype: WebSocket;
    readonly CONNECTING: 0;
    readonly OPEN: 1;
    readonly CLOSING: 2;
    readonly CLOSED: 3;
  };
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
  run: jest.fn().mockImplementation((context, fn) => fn()),
  getTenantContext: jest.fn(),
  setTenantContext: jest.fn(),
  clearTenantContext: jest.fn()
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