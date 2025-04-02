import 'jest-environment-jsdom';
import { CircuitState } from './src/lib/circuit-breaker';
import { createCircuitBreakerMock, circuitBreakerMock, MockCircuitBreaker } from './__mocks__/circuit-breaker.mock';
import { createMetricsCollectorMock, metricsCollectorMock, MetricsCollectorMock } from './__mocks__/metrics-collector.mock';
import { getTenantContextMock, setTenantContextMock, clearTenantContextMock } from './__mocks__/tenant-context.mock';
import prisma from './__mocks__/prisma.mock';

// Helper functions
function createMockMetricsCollector(props?: any): MetricsCollectorMock {
  return createMetricsCollectorMock();
}

function createTestConflict(props: any = {}) {
  return {
    id: props.id || 'conflict-1',
    documentId: props.documentId || 'doc-1',
    type: props.type || 'TEXT_EDIT',
    local: props.local || {},
    remote: props.remote || {},
    localContent: props.localContent || 'Local content',
    remoteContent: props.remoteContent || 'Remote content',
    userId: props.userId || 'test-user',
    createdAt: props.createdAt || new Date(),
    resolvedAt: props.resolvedAt,
    resolution: props.resolution
  };
}

function createMockDocument(props: any = {}) {
  return {
    id: props.id || 'doc-123',
    content: props.content || 'Test document content',
    version: props.version || 1,
    metadata: props.metadata || {},
    userId: props.userId || 'user-1',
    tenantId: props.tenantId || 'tenant-1',
    createdAt: props.createdAt || new Date(),
    updatedAt: props.updatedAt || new Date()
  };
}

class MockWebSocket {
  listeners: Record<string, Function[]> = {};
  messages: any[] = [];

  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }

  off(event: string): void {
    delete this.listeners[event];
  }

  emit(event: string, data: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
    this.messages.push({ event, data });
  }

  triggerMessage(message: string): void {
    if (this.listeners['message']) {
      this.listeners['message'].forEach(callback => callback({ data: message }));
    }
  }

  reset(): void {
    this.listeners = {};
    this.messages = [];
  }

  simulateReconnection(): void {
    if (this.listeners['reconnect']) {
      this.listeners['reconnect'].forEach(callback => callback());
    }
  }
}

// Create mock instances
const mockMetricsCollector = createMockMetricsCollector();
const mockCircuitBreaker = createCircuitBreakerMock() as MockCircuitBreaker;

// Define global types
declare global {
  var mockMetricsCollector: MetricsCollectorMock;
  var mockCircuitBreaker: MockCircuitBreaker;
  var createMockMetricsCollector: (props?: any) => MetricsCollectorMock;
  var createTestConflict: (props?: any) => any;
  var createMockDocument: (props?: any) => any;
  var MockWebSocket: new () => any;
}

// Set up globals
global.mockMetricsCollector = metricsCollectorMock;
global.mockCircuitBreaker = circuitBreakerMock;
global.createMockMetricsCollector = createMockMetricsCollector;
global.createTestConflict = createTestConflict;
global.createMockDocument = createMockDocument;
global.MockWebSocket = MockWebSocket;

// Export for direct imports
export {
  createTestConflict,
  createMockDocument,
  MockWebSocket,
  createMockMetricsCollector  // This was missing but is now added
};

// Set up global mocks
jest.mock('./src/lib/circuit-breaker', () => ({
  CircuitBreaker: createCircuitBreakerMock,
  CircuitState: {
    OPEN: 'OPEN',
    CLOSED: 'CLOSED',
    HALF_OPEN: 'HALF_OPEN'
  }
}));

jest.mock('./src/metrics/metrics-collector', () => ({
  MetricsCollector: createMetricsCollectorMock,
  default: metricsCollectorMock
}));

// Mock PrismaClient
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma)
}));

// Suppress console errors during tests
global.console.error = jest.fn();