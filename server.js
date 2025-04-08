const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const WebSocket = require('ws');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Rooms for storing collaborative document state
const rooms = new Map();

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
  
  // Set up WebSocket server
  const wss = new WebSocket.Server({ noServer: true });
  
  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const { pathname } = parse(request.url);
    
    if (pathname === '/yjs') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Get room parameters from URL
        const url = new URL(request.url, `http://${request.headers.host}`);
        const documentId = url.searchParams.get('documentId') || 'default';
        const tenantId = url.searchParams.get('tenantId') || 'default';
        const roomId = `${tenantId}-${documentId}`;
        
        console.log(`Client connected to room: ${roomId}`);
        
        // Create room if it doesn't exist
        if (!rooms.has(roomId)) {
          rooms.set(roomId, {
            clients: new Set(),
            content: ''
          });
        }
        
        const room = rooms.get(roomId);
        room.clients.add(ws);
        
        // Send current content to new client
        if (room.content) {
          ws.send(JSON.stringify({ type: 'content', data: room.content }));
        }
        
        // Update user count
        broadcastUserCount(roomId);
        
        // Handle messages
        ws.on('message', (message) => {
          try {
            const data = JSON.parse(message.toString());
            
            if (data.type === 'content') {
              room.content = data.data;
              
              // Broadcast to all other clients
              room.clients.forEach((client) => {
                if (client !== ws && client.readyState === WebSocket.OPEN) {
                  client.send(message.toString());
                }
              });
            }
          } catch (error) {
            console.error('Error handling message:', error);
          }
        });
        
        // Handle disconnection
        ws.on('close', () => {
          console.log(`Client disconnected from room: ${roomId}`);
          room.clients.delete(ws);
          
          // Clean up room if empty
          if (room.clients.size === 0) {
            setTimeout(() => {
              if (rooms.has(roomId) && rooms.get(roomId).clients.size === 0) {
                rooms.delete(roomId);
                console.log(`Room deleted: ${roomId}`);
              }
            }, 60000); // 1 minute
          } else {
            broadcastUserCount(roomId);
          }
        });
      });
    }
  });
  
  // Helper function to broadcast user count
  function broadcastUserCount(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;
    
    const userCount = room.clients.size;
    const message = JSON.stringify({ type: 'userCount', data: userCount });
    
    room.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
  
  // Start server
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log('> Collaborative editing websocket server running');
  });
});