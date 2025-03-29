// Create a basic WebSocket service for tests

import { MockWebSocket } from '../__mocks__/websocket.mock';

/**
 * Create a WebSocket connection to the specified URL
 */
export function createWebSocket(url: string = '/socket'): MockWebSocket {
  return new MockWebSocket();
}

/**
 * Hook to use WebSocket in functional components
 */
export function useWebSocket(url: string = '/socket') {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    send: jest.fn(),
    subscribe: jest.fn()
  };
}