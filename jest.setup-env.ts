import 'jest-environment-jsdom';
// Now import jest-dom after Jest environment is set up

// Mock implementations for browser APIs not available in Node.js
global.ResizeObserver = class ResizeObserver {
  observe = jest.fn();
  unobserve = jest.fn();
  disconnect = jest.fn();
};

// Add other mock implementations
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

// Properly typed MockWebSocket class
class MockWebSocket {
  url: string;
  readyState: number = 1; // OPEN
  binaryType: BinaryType = 'blob';
  bufferedAmount: number = 0;
  extensions: string = '';
  protocol: string = '';
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  
  // Define as static readonly with literal types
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;  
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  
  // Define instance properties with literal types
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    setTimeout(() => {
      if (this.onopen) {
        // Create an Event rather than passing empty object
        const event = new Event('open') as Event;
        (this.onopen as any).call(this, event);
      }
    }, 0);
  }
  
  send = jest.fn();
  close = jest.fn();
  
  addEventListener(type: string, listener: EventListener, options?: boolean | AddEventListenerOptions): void {
    if (type === 'open') this.onopen = listener as any;
    if (type === 'message') this.onmessage = listener as any;
    if (type === 'error') this.onerror = listener as any;
    if (type === 'close') this.onclose = listener as any;
  }
  
  removeEventListener(type: string, listener: EventListener, options?: boolean | EventListenerOptions): void {
    if (type === 'open' && this.onopen === listener) this.onopen = null;
    if (type === 'message' && this.onmessage === listener) this.onmessage = null;
    if (type === 'error' && this.onerror === listener) this.onerror = null;
    if (type === 'close' && this.onclose === listener) this.onclose = null;
  }

  dispatchEvent(event: Event): boolean {
    return true;
  }
}

// Mock WebSocket
global.WebSocket = MockWebSocket as any;

// Mock web crypto for UUID generation
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