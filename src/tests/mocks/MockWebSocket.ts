/**
 * Mock implementation of WebSocket for testing
 */
export class MockWebSocket {
  // Add standard WebSocket constants
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  
  // Instance properties that mirror WebSocket
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  
  readyState: number = 0;
  url: string = '';
  protocol: string = '';
  extensions: string = '';
  binaryType: string = 'blob';
  bufferedAmount: number = 0;
  
  // Event handlers
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  
  // Test-specific properties
  private listeners: Record<string, Function[]> = {};
  messages: any[] = [];
  
  constructor(url?: string) {
    this.url = url || 'ws://localhost:8080';
    this.readyState = this.CONNECTING;
    
    // Simulate immediate connection
    setTimeout(() => {
      this.readyState = this.OPEN;
      if (this.onopen) {
        const event = new Event('open');
        this.onopen(event);
      }
    }, 0);
  }
  
  close(code?: number, reason?: string): void {
    this.readyState = this.CLOSING;
    
    setTimeout(() => {
      this.readyState = this.CLOSED;
      if (this.onclose) {
        const event = new CloseEvent('close', {
          code: code || 1000,
          reason: reason || '',
          wasClean: true
        });
        this.onclose(event);
      }
    }, 0);
  }
  
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.messages.push(data);
  }
  
  // Event listener methods
  addEventListener(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  }
  
  removeEventListener(event: string): void {
    this.listeners[event] = [];
  }
  
  dispatchEvent(event: Event): boolean {
    if (this.listeners[event.type]) {
      this.listeners[event.type].forEach(callback => callback(event));
    }
    return true;
  }
  
  // Methods for testing
  triggerMessage(message: string): void {
    const event = {
      data: message,
      type: 'message',
      target: this
    };
    
    if (this.onmessage) {
      this.onmessage(event as any);
    }
    
    if (this.listeners['message']) {
      this.listeners['message'].forEach(cb => cb(event));
    }
  }
  
  reset(): void {
    this.messages = [];
    this.listeners = {};
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
  }
  
  simulateReconnection(): void {
    this.close();
    setTimeout(() => {
      this.readyState = this.CONNECTING;
      setTimeout(() => {
        this.readyState = this.OPEN;
        if (this.onopen) {
          const event = new Event('open');
          this.onopen(event);
        }
      }, 10);
    }, 10);
  }
}

// Create a static factory function that can be used in tests
export function createMockWebSocket(): MockWebSocket {
  return new MockWebSocket();
}

// React component wrapper for WebSocket provider in tests
export function MockWebSocketProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}