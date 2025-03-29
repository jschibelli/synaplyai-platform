export class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  
  url: string;
  readyState: number = 0;
  binaryType: string = 'blob';
  extensions: string = '';
  protocol: string = '';
  bufferedAmount: number = 0;
  
  // Event handlers
  onopen: ((this: WebSocket, ev: Event) => any) | null = null;
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null;
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null;
  onerror: ((this: WebSocket, ev: Event) => any) | null = null;
  
  // Messages for testing
  static sentMessages: any[] = [];
  messages: any[] = [];

  constructor(url: string = 'ws://localhost:8080') {
    this.url = url;
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        const event = new Event('open');
        this.onopen(event as any);
      }
    }, 0);
  }

  send(data: string): void {
    const parsed = JSON.parse(data);
    MockWebSocket.sentMessages.push(parsed);
    this.messages.push(parsed);
  }
  
  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      const event = new CloseEvent('close');
      this.onclose(event as any);
    }
  }

  // Event handling
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
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  // Helper methods for tests
  static triggerMessage(data: any): void {
    // Static helper for tests
  }
  
  triggerMessage(data: any): void {
    if (this.onmessage) {
      this.onmessage({ data } as any);
    }
  }
  
  static reset(): void {
    MockWebSocket.sentMessages = [];
  }
  
  static simulateReconnection(): void {
    // Implementation for reconnection simulation
  }
}