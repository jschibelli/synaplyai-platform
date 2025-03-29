import { Conflict } from '../../src/conflicts/ConflictResolver';
import { Operation } from '../../src/collaborative/OperationalTransform';
import { VectorClock } from '../../src/collaborative/VectorClock';
import { ConflictType } from '../../src/collaboration/conflict/types';
import { 
  createMockConflict, 
  createMockResolution 
} from '../../src/tests/test-helpers';

/**
 * Re-exports from src/tests/test-helpers to maintain compatibility
 */
export { 
  createMockConflict, 
  createMockResolution 
};

/**
 * Creates a test conflict for testing purposes
 */
export function createTestConflict(props: any = {}) {
  return {
    id: props.id || 'conflict-1',
    documentId: props.documentId || 'doc-1', 
    type: props.type || ConflictType.TEXT_EDIT,
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
 * Creates a mock document for testing purposes
 */
export function createMockDocument(props: any = {}) {
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
 * Mock a WebSocket for testing
 */
export class MockWebSocket {
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
