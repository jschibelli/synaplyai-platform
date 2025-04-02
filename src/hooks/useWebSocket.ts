import { useState, useEffect, useRef } from 'react';

interface UseWebSocketReturn {
  lastMessage: MessageEvent | null;
  sendMessage: (data: string) => void;
  connected: boolean;
  on: (event: string, callback: (data: any) => void) => void;
  off: (event: string) => void;
  emit: (event: string, data: any) => void;
}

export function useWebSocket(url?: string): UseWebSocketReturn {
  // Default URL if none provided
  const actualUrl = url || process.env.REACT_APP_WS_URL || 'ws://localhost:3001';
  
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Create WebSocket connection
    const ws = new WebSocket(actualUrl);
    wsRef.current = ws;
    
    // Connection opened
    ws.onopen = () => {
      setConnected(true);
    };
    
    // Listen for messages
    ws.onmessage = (event) => {
      setLastMessage(event);
    };
    
    // Connection closed
    ws.onclose = () => {
      setConnected(false);
    };
    
    // Connection error
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    // Cleanup on unmount
    return () => {
      ws.close();
    };
  }, [actualUrl]);
  
  // Send message function
  const sendMessage = (data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  };

  const on = (event: string, callback: (data: any) => void) => {
    // Implementation
  };

  const off = (event: string) => {
    // Implementation
  };

  const emit = (event: string, data: any) => {
    // Implementation
  };
  
  return { lastMessage, sendMessage, connected, on, off, emit };
}