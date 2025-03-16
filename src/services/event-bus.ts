import { Server as HTTPServer } from 'http';
import { Server as WebSocketServer } from 'ws';

export class EventBus {
  private wss: WebSocketServer;
  
  constructor(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: '/api/events' });
    
    this.wss.on('connection', (ws) => {
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }
  
  async publish(eventType: string, data: any): Promise<void> {
    const message = JSON.stringify({
      type: eventType,
      timestamp: Date.now(),
      ...data
    });
    
    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }
}