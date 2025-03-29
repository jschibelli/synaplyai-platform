import { CircuitState } from './src/lib/circuit-breaker';
import prisma from './__mocks__/prisma.mock';

// First define the helper functions before using them
/**
 * Creates a mock metrics collector for testing
 */
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

/**
 * Creates a test conflict object for testing
 */
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

/**
 * Creates a mock document for testing
 */
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

/**
 * Mock WebSocket implementation for testing
 */
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
const mockCircuitBreaker = {
  state: CircuitState.CLOSED,
  failureCount: 0,
  successCount: 0,
  lastStateChange: Date.now(),
  execute: jest.fn().mockImplementation(fn => fn()),
  executeWithBulkhead: jest.fn().mockImplementation((fn, concurrencyLimit = 10) => fn()),
  serviceName: 'test-service',
  transitionToState: jest.fn().mockResolvedValue(undefined),
  getState: jest.fn().mockResolvedValue(CircuitState.CLOSED),
  recordSuccess: jest.fn().mockResolvedValue(undefined),
  recordFailure: jest.fn().mockResolvedValue(undefined),
  transitionState: jest.fn().mockResolvedValue(undefined),
  shouldAttemptReset: jest.fn().mockReturnValue(false),
  options: {
    failureThreshold: 3,
    successThreshold: 2,
    resetTimeoutMs: 30000
  }
};

// Type declarations for globals
declare global {
  // Define the interface for type safety without circular references
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

  interface MockCircuitBreaker {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastStateChange: number;
    execute: jest.Mock;
    executeWithBulkhead: jest.Mock;
    serviceName: string;
    getState: jest.Mock;
    recordSuccess: jest.Mock;
    recordFailure: jest.Mock;
    transitionState: jest.Mock;
    transitionToState: jest.Mock;
    shouldAttemptReset: jest.Mock;
    options: {
      failureThreshold: number;
      successThreshold: number;
      resetTimeoutMs: number;
    };
  }

  // Declare globals with explicit types
  var mockMetricsCollector: MockMetricsCollector;
  var mockCircuitBreaker: MockCircuitBreaker;
  var createMockMetricsCollector: () => MockMetricsCollector;
  var createTestConflict: (props?: any) => any;
  var createMockDocument: (props?: any) => any;
  var MockWebSocket: new () => any;
}

// Set up globals
global.mockMetricsCollector = mockMetricsCollector;
global.mockCircuitBreaker = mockCircuitBreaker;

// Register helpers
global.createMockMetricsCollector = jest.fn().mockImplementation(createMockMetricsCollector);
global.createTestConflict = jest.fn().mockImplementation(createTestConflict);
global.createMockDocument = jest.fn().mockImplementation(createMockDocument);
global.MockWebSocket = MockWebSocket;

// Mock PrismaClient
jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => prisma)
}));

// Export helpers for direct imports
export {
  createMockMetricsCollector,
  createTestConflict,
  createMockDocument,
  MockWebSocket
};