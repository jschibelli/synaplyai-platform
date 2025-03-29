import 'jest-environment-jsdom';

import { circuitBreakerMock } from './src/__mocks__/circuit-breaker.mock';
import { metricsCollectorMock } from './src/__mocks__/metrics-collector.mock';
import { getTenantContextMock, setTenantContextMock, clearTenantContextMock } from './src/__mocks__/tenant-context.mock';

// Mock implementations for browser APIs not available in Node.js
global.ResizeObserver = class ResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
};

global.IntersectionObserver = class IntersectionObserver {
  root: Element | null = null;
  rootMargin: string = '0px';
  thresholds: ReadonlyArray<number> = [0];
  
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
  takeRecords = jest.fn().mockReturnValue([]);
  
  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    // Constructor implementation can be minimal for tests
  }
};

// Mock fetch
global.fetch = jest.fn(() => 
  Promise.resolve({
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    ok: true
  })
) as jest.Mock;

// Complete WebSocket mock that extends EventTarget
class MockWebSocket extends EventTarget {
  // Standard WebSocket properties
  url: string;
  binaryType: BinaryType = 'blob';
  bufferedAmount: number = 0;
  extensions: string = '';
  protocol: string = '';
  readyState: number = 0;
  
  // Event handlers with proper types
  private _onclose: ((ev: CloseEvent) => any) | null = null;
  private _onerror: ((ev: Event) => any) | null = null;
  private _onmessage: ((ev: MessageEvent) => any) | null = null;
  private _onopen: ((ev: Event) => any) | null = null;
  
  // Implement getters and setters for event handlers
  get onclose(): ((this: WebSocket, ev: CloseEvent) => any) | null {
    return this._onclose;
  }
  
  set onclose(handler: ((this: WebSocket, ev: CloseEvent) => any) | null) {
    this._onclose = handler;
  }
  
  get onerror(): ((this: WebSocket, ev: Event) => any) | null {
    return this._onerror;
  }
  
  set onerror(handler: ((this: WebSocket, ev: Event) => any) | null) {
    this._onerror = handler;
  }
  
  get onmessage(): ((this: WebSocket, ev: MessageEvent) => any) | null {
    return this._onmessage;
  }
  
  set onmessage(handler: ((this: WebSocket, ev: MessageEvent) => any) | null) {
    this._onmessage = handler;
  }
  
  get onopen(): ((this: WebSocket, ev: Event) => any) | null {
    return this._onopen;
  }
  
  set onopen(handler: ((this: WebSocket, ev: Event) => any) | null) {
    this._onopen = handler;
  }
  
  // WebSocket constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;  
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  constructor(url: string, protocols?: string | string[]) {
    super(); // Initialize EventTarget
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this._onopen) {
        const event = new Event('open');
        // Dispatch to the EventTarget and call the handler directly
        this.dispatchEvent(event);
        this._onopen.call(this as unknown as WebSocket, event);
      }
    }, 0);
  }

  // WebSocket methods
  send = jest.fn();
  close = jest.fn(() => {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this._onclose) {
        const event = new CloseEvent('close');
        this.dispatchEvent(event);
        this._onclose.call(this as unknown as WebSocket, event);
      }
    }, 0);
  });
  
  // Helper methods for tests
  triggerMessage(data: any) {
    if (this._onmessage) {
      const event = new MessageEvent('message', { data });
      this.dispatchEvent(event);
      this._onmessage.call(this as unknown as WebSocket, event);
    }
  }
  
  triggerClose(code = 1000, reason = '') {
    if (this._onclose) {
      const event = new CloseEvent('close', { code, reason, wasClean: true });
      this.dispatchEvent(event);
      this._onclose.call(this as unknown as WebSocket, event);
    }
  }
  
  triggerError() {
    if (this._onerror) {
      const event = new Event('error');
      this.dispatchEvent(event);
      this._onerror.call(this as unknown as WebSocket, event);
    }
  }
}

// Assign to global - use type casting to ensure correct type
global.WebSocket = MockWebSocket as unknown as typeof WebSocket;

// Rest of your jest.setup-env.ts file...
Object.defineProperty(global, 'crypto', {
  value: {
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
    subtle: {}
  }
});

// Set environment variables before tests run
Object.defineProperty(process, 'env', {
  value: {
    ...process.env,
    NODE_ENV: 'test',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: 'test'
  }
});

// Mock modules
jest.mock('../src/lib/circuit-breaker', () => ({
  CircuitBreaker: jest.fn().mockImplementation(() => circuitBreakerMock),
  CircuitState: {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN'
  }
}));

jest.mock('../src/metrics/metrics-collector', () => ({
  MetricsCollector: jest.fn().mockImplementation(() => metricsCollectorMock)
}));

jest.mock('../src/lib/tenant-context', () => ({
  getTenantContext: getTenantContextMock,
  setTenantContext: setTenantContextMock,
  clearTenantContext: clearTenantContextMock,
  getCurrentTenantId: jest.fn().mockReturnValue('test-tenant')
}));

// Also mock the adaptive variant
jest.mock('./src/circuit-breaker/adaptive-breaker', () => ({
  AdaptiveCircuitBreaker: jest.fn().mockImplementation(() => circuitBreakerMock)
}));