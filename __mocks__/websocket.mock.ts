// WebSocket mock compatible with Next.js 15.2.4

export class MockWebSocket implements WebSocket {
  // Static constants
  static readonly CONNECTING: 0 = 0;
  static readonly OPEN: 1 = 1;
  static readonly CLOSING: 2 = 2;
  static readonly CLOSED: 3 = 3;
  
  // Instance properties
  readonly CONNECTING: 0 = 0;
  readonly OPEN: 1 = 1;
  readonly CLOSING: 2 = 2;
  readonly CLOSED: 3 = 3;
  
  url: string;
  readyState: number = MockWebSocket.OPEN; // Start in OPEN state by default
  binaryType: 'blob' | 'arraybuffer' = 'blob';
  protocol: string = '';
  extensions: string = '';
  bufferedAmount: number = 0;
  
  // Event handlers
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  
  // Storage for events
  listeners: {[key: string]: Array<EventListenerOrEventListenerObject>} = {};
  
  // For test tracking
  static sentMessages: any[] = [];
  messages: any[] = [];
  
  constructor(url: string | URL, protocols?: string | string[]) {
    this.url = url.toString();
    
    // Simulate connection event on next tick
    setTimeout(() => {
      if (this.onopen) {
        this.onopen(new Event('open') as any);
      }
      this.emit('open', new Event('open'));
    }, 0);
  }
  
  // WebSocket methods
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    try {
      let parsedData = data;
      if (typeof data === 'string') {
        try {
          parsedData = JSON.parse(data);
        } catch (e) {
          // Keep as string if not JSON
        }
      }
      
      MockWebSocket.sentMessages.push(parsedData);
      this.messages.push(parsedData);
    } catch (e) {
      console.error('Error in mock WebSocket send:', e);
    }
  }
  
  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSING;
    
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { 
          code: code || 1000, 
          reason: reason || '',
          wasClean: true
        }) as any);
      }
      
      this.emit('close', new CloseEvent('close', { 
        code: code || 1000, 
        reason: reason || '',
        wasClean: true
      }));
    }, 0);
  }
  
  // EventTarget methods
  addEventListener<K extends keyof WebSocketEventMap>(
    type: K, 
    listener: (ev: WebSocketEventMap[K]) => any, 
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    if (!this.listeners[type]) {
      this.listeners[type] = [];
    }
    this.listeners[type].push(listener);
    
    // If already open and trying to listen for open event, trigger immediately
    if (type === 'open' && this.readyState === MockWebSocket.OPEN) {
      (listener as EventListener)(new Event('open'));
    }
  }
  
  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K,
    listener: (ev: WebSocketEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter(l => l !== listener);
    }
  }
  
  dispatchEvent(event: Event): boolean {
    const type = event.type;
    
    if (this.listeners[type]) {
      for (const listener of this.listeners[type]) {
        if (typeof listener === 'function') {
          listener(event);
        } else {
          listener.handleEvent(event);
        }
      }
    }
    
    switch (type) {
      case 'open':
        if (this.onopen) this.onopen(event);
        break;
      case 'close':
        if (this.onclose) this.onclose(event as CloseEvent);
        break;
      case 'message':
        if (this.onmessage) this.onmessage(event as MessageEvent);
        break;
      case 'error':
        if (this.onerror) this.onerror(event);
        break;
    }
    
    return !event.cancelable || !event.defaultPrevented;
  }
  
  // Helper methods for testing
  on(event: string, callback: Function): void {
    // Cast the event type to a valid WebSocketEventMap key or use a type assertion
    const validEvent = event as keyof WebSocketEventMap;
    this.addEventListener(validEvent, callback as EventListener);
  }
  
  off(event: string): void {
    this.listeners[event] = [];
  }
  
  emit(event: string, data: any): void {
    if (event === 'message') {
      const messageEvent = new MessageEvent('message', { data }) as any;
      this.dispatchEvent(messageEvent);
    } else {
      this.dispatchEvent(data);
    }
  }
  
  triggerMessage(message: string): void {
    const event = new MessageEvent('message', { data: message }) as any;
    if (this.onmessage) {
      this.onmessage(event);
    }
    this.dispatchEvent(event);
  }
  
  // Reset for test isolation
  reset(): void {
    this.messages = [];
    MockWebSocket.sentMessages = [];
    this.listeners = {};
  }
  
  // Used in tests to simulate reconnection
  simulateReconnection(): void {
    this.readyState = MockWebSocket.OPEN;
    this.emit('open', new Event('open'));
  }
}

// Also export a factory function for TypeScript support
export function createMockWebSocket(url: string | URL): MockWebSocket {
  return new MockWebSocket(url);
}

// Make it globally available
if (typeof global !== 'undefined') {
  (global as any).WebSocket = MockWebSocket;
}

// Export for React context testing
export function MockWebSocketProvider({ children }: { children: React.ReactNode }) {
  return children;
}