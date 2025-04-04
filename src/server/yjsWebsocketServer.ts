import http from 'http';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import * as awarenessProtocol from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { metricsCollector } from '../metrics/metrics-collector';

const docs = new Map<string, {
  doc: Y.Doc,
  awareness: awarenessProtocol.Awareness,
  clients: Set<any>
}>();

// Message types for binary protocol
const messageSync = 0;
const messageAwareness = 1;
const messageAuth = 2;

/**
 * Set up YJS WebSocket server for real-time collaboration
 */
export function setupYjsWebSocketServer(server: http.Server) {
  const wss = new WebSocketServer({ noServer: true });
  
  // Handle WebSocket upgrade
  server.on('upgrade', (request, socket, head) => {
    const url = new URL(request.url || '', `http://${request.headers.host}`);
    
    // Only handle YJS WebSocket connections
    if (url.pathname === '/yjs') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        // Parse query parameters
        const tenantId = url.searchParams.get('tenantId') || 'default';
        const docName = url.searchParams.get('docName') || 'default';
        const userId = url.searchParams.get('userId') || 'anonymous';
        
        // Use tenant isolation - room includes tenantId
        const roomName = `${tenantId}-${docName}`;
        
        handleConnection(ws, roomName, {
          tenantId,
          docName,
          userId
        });
        
        metricsCollector.increment('yjs.client.connected', {
          tenantId,
          documentId: docName
        });
      });
    }
  });
  
  // Keep connections alive with ping
  const pingInterval = setInterval(() => {
    wss.clients.forEach((client: any) => {
      if (client.readyState === client.OPEN) {
        client.ping();
      }
    });
  }, 30000); // 30 seconds
  
  // Clean up timer on server close
  server.on('close', () => {
    clearInterval(pingInterval);
    
    // Close all connections and clean up docs
    docs.forEach((docData) => {
      docData.doc.destroy();
    });
    docs.clear();
  });
  
  console.log('YJS WebSocket server initialized');
  return wss;
}

/**
 * Handle a new WebSocket connection
 */
function handleConnection(ws: any, roomName: string, params: { tenantId: string, docName: string, userId: string }) {
  // Get or create document for this room
  let docData = docs.get(roomName);
  if (!docData) {
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    docData = { doc, awareness, clients: new Set() };
    docs.set(roomName, docData);
    
    console.log(`Created new document: ${roomName}`);
    metricsCollector.increment('yjs.document.created', {
      tenantId: params.tenantId,
      documentId: params.docName
    });
  }
  
  // Add client to document
  docData.clients.add(ws);
  
  // Set up message handler
  ws.on('message', (message: Uint8Array) => {
    handleMessage(ws, message, docData, roomName);
  });
  
  // Handle disconnect
  ws.on('close', () => {
    // Remove client
    docData.clients.delete(ws);
    
    // Clear client's awareness states
    awarenessProtocol.removeAwarenessStates(
      docData.awareness,
      [ws.yClientId],
      'connection closed'
    );
    
    console.log(`Client disconnected from ${roomName}`);
    
    // Clean up empty documents
    if (docData.clients.size === 0) {
      docs.delete(roomName);
      console.log(`Removed inactive document: ${roomName}`);
    }
  });
}

/**
 * Handle incoming WebSocket messages
 */
function handleMessage(ws: any, message: Uint8Array, docData: { doc: Y.Doc, awareness: awarenessProtocol.Awareness, clients: Set<any> }, roomName: string) {
  try {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);
    
    switch (messageType) {
      case messageSync: {
        // Handle document sync message
        const syncMessage = decoding.readVarUint8Array(decoder);
        Y.applyUpdate(docData.doc, syncMessage);
        
        // Broadcast update to all other clients
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageSync);
        encoding.writeVarUint8Array(encoder, syncMessage);
        const syncData = encoding.toUint8Array(encoder);
        
        docData.clients.forEach((client) => {
          if (client !== ws && client.readyState === client.OPEN) {
            client.send(syncData);
          }
        });
        break;
      }
      
      case messageAwareness: {
        // Handle awareness update
        const awarenessUpdate = decoding.readVarUint8Array(decoder);
        awarenessProtocol.applyAwarenessUpdate(docData.awareness, awarenessUpdate, ws);
        
        // Broadcast awareness update to other clients
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, messageAwareness);
        encoding.writeVarUint8Array(encoder, awarenessUpdate);
        const awarenessData = encoding.toUint8Array(encoder);
        
        docData.clients.forEach((client) => {
          if (client !== ws && client.readyState === client.OPEN) {
            client.send(awarenessData);
          }
        });
        break;
      }
      
      case messageAuth: {
        // Handle auth message (future enhancement)
        const authData = JSON.parse(decoding.readVarString(decoder));
        console.log(`Auth data:`, authData);
        break;
      }
    }
  } catch (err) {
    console.error(`Error handling message:`, err);
  }
}