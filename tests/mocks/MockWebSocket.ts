import React from 'react';

// Mock WebSocket implementation for testing
export const MockWebSocket = {
  listeners: {},
  messages: [],
  
  on(event: string, callback: Function): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
  },
  
  off(event: string): void {
    delete this.listeners[event];
  },
  
  emit(event: string, data: any): void {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  },
  
  triggerMessage(message: string): void {
    this.messages.push(message);
    this.emit('message', message);
  },
  
  reset(): void {
    this.listeners = {};
    this.messages = [];
  },
  
  simulateReconnection(): void {
    this.emit('open', {});
  }
};

export function MockWebSocketProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}