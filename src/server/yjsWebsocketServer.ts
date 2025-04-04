import * as http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection } from 'y-websocket/bin/utils';
import { metricsCollector } from '../metrics/metrics-collector';
import { parse } from 'url';

interface YjsConnectionOptions {
  pingInterval?: number;
  gcEnabled?: boolean;
}

/**
 * Create a WebSocket server for YJS real-time collaboration
 */
export function createYjsWebsocketServer(
  httpServer: http.Server, 
  options: YjsConnectionOptions = {}
) {
  // Create WebSocket server
  const wss = new WebSocketServer({ noServer: true });
  
  // Track connected clients by tenant
  const clientsByTenant: Record<string, Set<string>> = {};
  
  // Set up ping interval to keep connections alive
  const pingInterval = options.pingInterval || 30000;
  const pingIntervalId = setInterval(() => {
    wss.clients.forEach((client) => {
      if (client.readyState === client.OPEN) {
        client.ping();
      }
    });
  }, pingInterval);
  
  // Handle WebSocket connections
  httpServer.on('upgrade', (request, socket, head) => {
    // Parse URL to extract query parameters
    const { pathname, query } = parse(request.url || '', true);
    
    // Only handle YJS-related WebSocket connections
    if (pathname?.startsWith('/yjs')) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });
  
  wss.on('connection', (ws, req) => {
    // Parse URL to extract query parameters
    const { query } = parse(req.url || '', true);
    const tenantId = query.tenantId as string || 'default';
    const userId = query.userId as string || 'anonymous';
    const clientId = `${userId}-${Date.now()}`;
    
    // Initialize tenant tracking if needed
    if (!clientsByTenant[tenantId]) {
      clientsByTenant[tenantId] = new Set();
    }
    
    // Add client to tenant tracking
    clientsByTenant[tenantId].add(clientId);
    
    // Track connection metrics
    metricsCollector.increment('yjs.client.connected', {
      tenantId,
      clientCount: clientsByTenant[tenantId].size.toString()
    });
    
    console.log(`YJS client connected: ${clientId} (tenant: ${tenantId})`);
    
    // Set up YJS WebSocket connection
    setupWSConnection(ws, req, { 
      gc: options.gcEnabled !== false
    });
    
    // Handle client disconnect
    ws.on('close', () => {
      console.log(`YJS client disconnected: ${clientId} (tenant: ${tenantId})`);
      
      // Remove client from tenant tracking
      if (clientsByTenant[tenantId]) {
        clientsByTenant[tenantId].delete(clientId);
        
        // Track disconnection metrics
        metricsCollector.increment('yjs.client.disconnected', {
          tenantId,
          clientCount: clientsByTenant[tenantId].size.toString()
        });
      }
    });
  });
  
  // Clean up on server shutdown
  httpServer.on('close', () => {
    clearInterval(pingIntervalId);
    console.log('YJS WebSocket server shut down');
  });
  
  console.log('YJS WebSocket server initialized');
  return wss;
}