const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Initialize Y.js WebSocket server
const initYjsWebSocketServer = (server) => {
  try {
    let setupYjsWebSocketServer;
    
    // In development, use esbuild-register to load TypeScript directly
    if (dev) {
      require('esbuild-register');
      setupYjsWebSocketServer = require('./src/server/yjsWebsocketServer').setupYjsWebSocketServer;
    } else {
      // In production, use the compiled JavaScript
      setupYjsWebSocketServer = require('./dist/server/yjsWebsocketServer').setupYjsWebSocketServer;
    }
    
    setupYjsWebSocketServer(server);
    console.log('YJS WebSocket server initialized successfully');
  } catch (error) {
    console.error('Failed to initialize YJS WebSocket server:', error);
  }
};

app.prepare().then(() => {
  // Create HTTP server
  const server = createServer(async (req, res) => {
    try {
      // Parse URL
      const parsedUrl = parse(req.url, true);
      
      // Let Next.js handle the request
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });
  
  // Initialize YJS WebSocket server
  initYjsWebSocketServer(server);
  
  // Start listening
  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});