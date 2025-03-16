import { useState, useEffect, useRef } from 'react';

interface UseWebSocketReturn {
  lastMessage: MessageEvent | null;
  sendMessage: (data: string) => void;
  connected: boolean;
}

export function useWebSocket(url: string): UseWebSocketReturn {
  const [lastMessage, setLastMessage] = useState<MessageEvent | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Create WebSocket connection
    const ws = new WebSocket(url);
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
  }, [url]);
  
  // Send message function
  const sendMessage = (data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  };
  
  return { lastMessage, sendMessage, connected };
}