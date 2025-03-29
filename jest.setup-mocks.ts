import { CircuitState } from './src/lib/circuit-breaker';
// Import instead of redefining - this fixes the conflict
import { MockCircuitBreaker, createCircuitBreakerMock } from './__mocks__/circuit-breaker.mock';
import prisma from './__mocks__/prisma.mock';

// Define interfaces first for better TypeScript support
interface MockMetricsCollector {
  metrics: any;
  redisClient: any;
  increment: jest.Mock;
  recordLatency: jest.Mock;
  incrementCounter: jest.Mock;
  decrementCounter: jest.Mock;
  getCounter: jest.Mock;
  recordValue: jest.Mock;
  getAverageValue: jest.Mock;
  getCountValue: jest.Mock;
  formatKey: jest.Mock;
  track: jest.Mock;
  setCircuitBreakerState: jest.Mock;
  getCircuitBreakerState: jest.Mock;
  incrementCircuitBreakerFailures: jest.Mock;
  incrementCircuitBreakerRejections: jest.Mock;
  getFilterResultCounts: jest.Mock;
  getPercentileLatency: jest.Mock;
  getPipelineLatency: jest.Mock;
}

// First define helper functions
function createMockMetricsCollector() {
  return {
    metrics: {},
    redisClient: {} as any,
    increment: jest.fn().mockResolvedValue(undefined),
    recordLatency: jest.fn().mockResolvedValue(undefined),
    incrementCounter: jest.fn().mockResolvedValue(undefined),
    decrementCounter: jest.fn().mockResolvedValue(undefined),
    getCounter: jest.fn().mockResolvedValue(0),
    recordValue: jest.fn().mockResolvedValue(undefined),
    getAverageValue: jest.fn().mockResolvedValue(0),
    getCountValue: jest.fn().mockResolvedValue(0),
    formatKey: jest.fn().mockReturnValue('formatted-key'),
    track: jest.fn().mockResolvedValue(undefined),
    setCircuitBreakerState: jest.fn().mockResolvedValue(undefined),
    getCircuitBreakerState: jest.fn().mockResolvedValue('CLOSED'),
    incrementCircuitBreakerFailures: jest.fn().mockResolvedValue(undefined),
    incrementCircuitBreakerRejections: jest.fn().mockResolvedValue(undefined),
    getFilterResultCounts: jest.fn().mockResolvedValue({}),
    getPercentileLatency: jest.fn().mockResolvedValue(0),
    getPipelineLatency: jest.fn().mockResolvedValue(0)
  };
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

// Create mock instances - use the factory
const mockMetricsCollector = createMockMetricsCollector();
const mockCircuitBreaker = createCircuitBreakerMock();

// Define global types - no longer using typeof references to avoid circular references
declare global {
  var mockMetricsCollector: MockMetricsCollector;
  var mockCircuitBreaker: MockCircuitBreaker;
  var createMockMetricsCollector: (props?: any) => MockMetricsCollector;
  var createTestConflict: (props?: any) => any;
  var createMockDocument: (props?: any) => any;
  var MockWebSocket: new () => any;
}

// Set up globals without type assertions that cause issues
global.mockMetricsCollector = mockMetricsCollector;
global.mockCircuitBreaker = mockCircuitBreaker;

// Register helpers as global functions
global.createMockMetricsCollector = createMockMetricsCollector;
global.createTestConflict = createTestConflict;
global.createMockDocument = createMockDocument;
global.MockWebSocket = MockWebSocket;

// Mock PrismaClient with prisma mock
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma)
}));

// Need this export for direct imports in test files
export {
  createMockMetricsCollector,
  createTestConflict,
  createMockDocument,
  MockWebSocket
};