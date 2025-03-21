import React from 'react';

// Mock WebSocket implementation for testing
export const MockWebSocket = {
  listeners: {},
  messages: [],
  
  on(event: string, callback: Function) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  
  off(event: string) {
    delete this.listeners[event];
  },
  
  emit(event: string, data: any) {
    this.messages.push({
      type: event,
      ...data
    });
  },
  
  triggerMessage(message: string) {
    const data = JSON.parse(message);
    const event = data.type;
    
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  },
  
  reset() {
    this.listeners = {};
    this.messages = [];
  },
  
  simulateReconnection() {
    if (this.listeners['reconnect']) {
      this.listeners['reconnect'].forEach(callback => callback());
    }
  }
};

// Provider component for testing
export const MockWebSocketProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  return (
    <div data-testid="mock-websocket-provider">
      {children}
    </div>
  );
};