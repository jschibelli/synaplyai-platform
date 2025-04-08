import * as http from 'http';
import { createYjsWebsocketServer } from './yjsWebsocketServer';

// Create HTTP server
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('YJS WebSocket server is running');
});

// Initialize YJS WebSocket server
createYjsWebsocketServer(server);

// Configure server port
const PORT = parseInt(process.env.YJS_WEBSOCKET_PORT || '1234', 10);

// Start server
server.listen(PORT, () => {
  console.log(`YJS WebSocket server running on port ${PORT}`);
});