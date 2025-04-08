import { createServer } from 'http';
import { createYjsWebsocketServer } from '../../server/yjsWebsocketServer';
import { NextApiRequest, NextApiResponse } from 'next';

// Create HTTP server
const httpServer = createServer();

// Create YJS WebSocket server
const io = createYjsWebsocketServer(httpServer);

// Start server on a different port
const PORT = parseInt(process.env.YJS_WEBSOCKET_PORT || '1234', 10);
httpServer.listen(PORT, () => {
  console.log(`YJS WebSocket server running on port ${PORT}`);
});

// This endpoint is just a placeholder since the actual WebSocket
// server is running separately
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({ 
    status: 'YJS WebSocket server running',
    port: PORT
  });
}