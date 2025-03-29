/**
 * Mock WebSocket implementation for testing
 */
export class MockWebSocket implements WebSocket {
  // Static constants matching the WebSocket specification
  static readonly CONNECTING = 0;
  static readonly OPEN = 1; 
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  
  // Instance constants
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  
  // Required WebSocket properties
  url: string = '';
  protocol: string = '';
  extensions: string = '';
  bufferedAmount: number = 0;
  binaryType: 'blob' | 'arraybuffer' = 'blob';
  readyState: number = MockWebSocket.OPEN;
  
  // Event handlers
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  
  // Custom properties for testing
  listeners: Record<string, Function[]> = {};
  messages: any[] = [];

  constructor(url?: string | URL, protocols?: string | string[]) {
    this.url = typeof url === 'string' ? url : url?.toString() || '';
    this.protocol = typeof protocols === 'string' ? protocols : 
      (Array.isArray(protocols) ? protocols[0] : '');
  }

  // WebSocket required methods
  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.listeners['close']) {
      this.listeners['close'].forEach(callback => callback({ code, reason }));
    }
    
    if (this.onclose) {
      const event = { code, reason } as CloseEvent;
      this.onclose.call(this as unknown as WebSocket, event);
    }
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.messages.push({ type: 'send', data });
  }

  // EventTarget methods
  addEventListener<K extends keyof WebSocketEventMap>(
    type: K, 
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | AddEventListenerOptions
  ): void;
  addEventListener(
    type: string, 
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
  ): void {
    this.on(type, typeof listener === 'function' ? listener : listener.handleEvent);
  }

  removeEventListener<K extends keyof WebSocketEventMap>(
    type: K, 
    listener: (this: WebSocket, ev: WebSocketEventMap[K]) => any,
    options?: boolean | EventListenerOptions
  ): void;
  removeEventListener(
    type: string, 
    listener: EventListenerOrEventListenerObject,
    options?: boolean | EventListenerOptions
  ): void {
    this.off(type);
  }

  dispatchEvent(event: Event): boolean {
    const eventName = event.type;
    if (this.listeners[eventName]) {
      this.listeners[eventName].forEach(callback => callback(event));
      return !event.defaultPrevented;
    }
    return true;
  }

  // Testing utility methods
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
    
    if (this.onmessage) {
      const event = { data: message } as MessageEvent;
      this.onmessage.call(this as unknown as WebSocket, event);
    }
  }

  reset(): void {
    this.listeners = {};
    this.messages = [];
    this.readyState = MockWebSocket.OPEN;
  }

  simulateReconnection(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.listeners['reconnect']) {
      this.listeners['reconnect'].forEach(callback => callback());
    }
    
    if (this.onopen) {
      const event = {} as Event;
      this.onopen.call(this as unknown as WebSocket, event);
    }
  }
}

// Factory function
export function createMockWebSocket(): MockWebSocket {
  return new MockWebSocket();
}