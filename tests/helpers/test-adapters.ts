import { Conflict, ConflictType } from '../../src/conflicts/ConflictResolver';
import { Operation } from '../../src/collaborative/OperationalTransform';
import { VectorClock } from '../../src/collaborative/VectorClock';

/**
 * Create a test conflict for use in tests
 */
export function createTestConflict(overrides?: Partial<Conflict>): Conflict {
  const defaultConflict: Conflict = {
    id: 'conflict-1',
    type: ConflictType.TEXT_EDIT,
    localContent: 'Local content version',
    remoteContent: 'Remote content version',
    operations: {
      local: {
        type: 'insert',
        position: 0,
        text: 'Local '
      } as Operation,
      remote: {
        type: 'insert',
        position: 0,
        text: 'Remote '
      } as Operation
    },
    vectorClocks: {
      local: new VectorClock('node-1', 1),
      remote: new VectorClock('node-2', 1)
    }
  };

  return {
    ...defaultConflict,
    ...overrides
  };
}

/**
 * Create a mock document for testing
 */
export function createMockDocument(options: {
  id: string;
  content: string;
  version?: number;
  userId?: string;
  tenantId?: string;
}) {
  return {
    id: options.id,
    content: options.content,
    version: options.version || 1,
    userId: options.userId || 'user-1',
    tenantId: options.tenantId || 'tenant-1',
    metadata: {},
    formatting: {}
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
    this.listeners[event] = [];
  }

  emit(event: string, data: any): void {
    this.messages.push({ event, data });
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
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
