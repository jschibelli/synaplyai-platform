import React, { useState, useEffect, useRef } from 'react';

export default function CollaborativeEditorPage() {
  const [content, setContent] = useState("Start typing here to collaborate in real-time...");
  const [isConnected, setIsConnected] = useState(false);
  const [userCount, setUserCount] = useState(1);
  const wsRef = useRef<WebSocket | null>(null);
  
  // Connect to WebSocket server
  useEffect(() => {
    const wsUrl = new URL('/yjs', window.location.href);
    wsUrl.protocol = wsUrl.protocol.replace('http', 'ws');
    wsUrl.searchParams.append('documentId', 'demo-document');
    wsUrl.searchParams.append('tenantId', 'default');
    
    const ws = new WebSocket(wsUrl.toString());
    wsRef.current = ws;
    
    ws.onopen = () => {
      setIsConnected(true);
      console.log('Connected to YJS server');
      
      // Send initial content
      ws.send(JSON.stringify({ type: 'content', data: content }));
    };
    
    ws.onclose = () => {
      setIsConnected(false);
      console.log('Disconnected from YJS server');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'content') {
          setContent(message.data);
        } else if (message.type === 'userCount') {
          setUserCount(message.data);
        }
      } catch (error) {
        console.error('Error parsing message:', error);
      }
    };
    
    return () => {
      ws.close();
    };
  }, []);
  
  // Handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'content', data: newContent }));
    }
  };
  
  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Collaborative Editor (Beta)</h1>
      
      <div className="mb-4 flex items-center">
        <div className={`w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span>{isConnected ? 'Connected' : 'Disconnected'}</span>
        <span className="ml-4">Users online: {userCount}</span>
      </div>
      
      <div className="mb-4">
        <textarea
          value={content}
          onChange={handleContentChange}
          className="w-full h-64 p-2 border border-gray-300 rounded"
        />
      </div>
      
      <p className="text-sm text-gray-600">
        Open this page in multiple browser windows to see collaborative editing in action.
      </p>
      
      <div className="mt-8 p-4 bg-gray-100 rounded">
        <h2 className="font-semibold mb-2">Beta Testing Notes</h2>
        <p>This is a simplified implementation for the April 22nd beta. Full YJS integration coming soon.</p>
      </div>
    </div>
  );
}