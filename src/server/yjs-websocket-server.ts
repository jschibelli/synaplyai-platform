import * as http from 'http';
import { WebSocketServer } from 'ws';
import { setupWSConnection, setPersistence, getPersistence } from 'y-websocket/bin/utils';
import { LeveldbPersistence } from 'y-leveldb';
import { Redis } from 'ioredis';
import { metricsCollector } from '../metrics/metrics-collector';
import { ComplianceLogger } from '../lib/compliance-logger';
import { TenantAwareCircuitBreaker } from '../lib/circuit-breaker';

// Configuration with defaults
interface YjsServerConfig {
  port?: number;
  host?: string;
  path?: string;
  pingInterval?: number;
  leveldBDir?: string;
  redisUrl?: string;
  gcEnabled?: boolean;
}

const defaultConfig: YjsServerConfig = {
  port: parseInt(process.env.YJS_PORT || '1234', 10),
  host: process.env.YJS_HOST || 'localhost',
  path: process.env.YJS_PATH || '/yjs-sync',
  pingInterval: parseInt(process.env.YJS_PING_INTERVAL || '30000', 10),
  leveldBDir: process.env.YJS_LEVELDB_DIR || './yjs-data',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  gcEnabled: process.env.YJS_GC_ENABLED === 'true'
};

/**
 * Statistics of connected clients by tenant
 */
interface YjsServerStats {
  totalConnections: number;
  activeDocuments: number;
  clientsByTenant: Record<string, number>;
  clientsByDocument: Record<string, number>;
}

/**
 * Create a YJS WebSocket server with tenant isolation and monitoring
 */
export class YjsWebSocketServer {
  private wss: WebSocketServer | null = null;
  private httpServer: http.Server | null = null;
  private persistence: any = null;
  private pingInterval: NodeJS.Timeout | null = null;
  private redis: Redis | null = null;
  private circuitBreaker: TenantAwareCircuitBreaker | null = null;
  private config: YjsServerConfig;
  private clientsByTenant: Map<string, Set<WebSocket>> = new Map();
  private clientsByDocument: Map<string, Set<WebSocket>> = new Map();
  private documentsByTenant: Map<string, Set<string>> = new Map();
  
  constructor(config: YjsServerConfig = {}) {
    this.config = { ...defaultConfig, ...config };
    
    // Initialize Redis client
    if (this.config.redisUrl) {
      this.redis = new Redis(this.config.redisUrl);
      
      // Set up circuit breaker
      this.circuitBreaker = new TenantAwareCircuitBreaker(
        'system', 
        'yjs-server',
        {
          failureThreshold: 5,
          successThreshold: 3,
          resetTimeoutMs: 10000
        }
      );
    }
  }
  
  /**
   * Get server statistics
   */
  getStats(): YjsServerStats {
    return {
      totalConnections: Array.from(this.clientsByTenant.values())
        .reduce((sum, clients) => sum + clients.size, 0),
      activeDocuments: this.clientsByDocument.size,
      clientsByTenant: Array.from(this.clientsByTenant.entries())
        .reduce((acc, [tenant, clients]) => {
          acc[tenant] = clients.size;
          return acc;
        }, {} as Record<string, number>),
      clientsByDocument: Array.from(this.clientsByDocument.entries())
        .reduce((acc, [doc, clients]) => {
          acc[doc] = clients.size;
          return acc;
        }, {} as Record<string, number>)
    };
  }
  
  /**
   * Start the YJS WebSocket server
   */
  async start(): Promise<void> {
    try {
      // Set up persistence
      const persistence = await this.setupPersistence();
      setPersistence({ bindState: persistence.bindState });
      this.persistence = persistence;
      
      // Create HTTP server if one doesn't exist
      if (!this.httpServer) {
        this.httpServer = http.createServer((req, res) => {
          // Simple health check endpoint
          if (req.url === '/health') {
            const stats = this.getStats();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              status: 'ok',
              ...stats
            }));
            return;
          }
          
          res.writeHead(404);
          res.end();
        });
      }
      
      // Create WebSocket server
      this.wss = new WebSocketServer({ 
        server: this.httpServer,
        path: this.config.path 
      });
      
      // Start HTTP server
      await new Promise<void>((resolve) => {
        if (this.httpServer) {
          this.httpServer.listen(this.config.port, this.config.host, () => {
            console.log(`YJS WebSocket server running on ${this.config.host}:${this.config.port}${this.config.path}`);
            resolve();
          });
        } else {
          resolve();
        }
      });
      
      // Set up connection handling
      this.wss.on('connection', this.handleConnection.bind(this));
      
      // Setup ping interval for keeping connections alive
      this.setupPingInterval();
      
      // Record server startup in metrics
      metricsCollector.increment('yjs.server.started');
      
      // Log compliance event
      await ComplianceLogger.log({
        eventType: 'yjs.server.started',
        resourceId: 'yjs-server',
        description: 'YJS WebSocket server started',
        metadata: {
          host: this.config.host,
          port: this.config.port,
          path: this.config.path
        }
      });
      
      // Setup garbage collection if enabled
      if (this.config.gcEnabled && persistence.gc) {
        setInterval(() => {
          try {
            persistence.gc();
          } catch (err) {
            console.error('Error during YJS garbage collection:', err);
          }
        }, 60 * 60 * 1000); // Run GC every hour
      }
    } catch (error) {
      console.error('Failed to start YJS WebSocket server:', error);
      
      // Log error
      await ComplianceLogger.log({
        eventType: 'yjs.server.error',
        resourceId: 'yjs-server',
        description: 'Failed to start YJS WebSocket server',
        metadata: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
      
      throw error;
    }
  }
  
  /**
   * Set up persistence based on configuration
   */
  private async setupPersistence() {
    try {
      // Use LevelDB persistence
      const persistence = new LeveldbPersistence(this.config.leveldBDir!);
      
      // Add additional functionality
      return {
        bindState: (docName: string, ydoc: any) => persistence.bindState(docName, ydoc),
        writeState: async (docName: string, ydoc: any) => {
          try {
            return await persistence.writeState(docName, ydoc);
          } catch (err) {
            console.error(`Error writing state for document ${docName}:`, err);
            
            // Log compliance event for data persistence failure
            await ComplianceLogger.log({
              eventType: 'yjs.persistence.error',
              resourceId: docName,
              description: `Failed to persist document state`,
              metadata: {
                error: err instanceof Error ? err.message : String(err)
              }
            });
            
            throw err;
          }
        },
        provider: persistence
      };
    } catch (error) {
      console.error('Failed to initialize YJS persistence:', error);
      throw error;
    }
  }
  
  /**
   * Handle a new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage) {
    try {
      const params = new URLSearchParams(req.url!.split('?')[1] || '');
      const tenantId = params.get('tenantId') || 'default';
      const docName = params.get('docName');
      
      if (!docName) {
        ws.close(1008, 'Missing document name');
        return;
      }
      
      // Store connection by tenant and document
      this.addClient(tenantId, docName, ws);
      
      // Track metrics
      metricsCollector.increment('yjs.client.connected', {
        tenantId
      });
      
      // Setup Y-WebSocket connection
      setupWSConnection(ws, req, {
        docName: `${tenantId}-${docName}`, // Prefix with tenant ID for isolation
      });
      
      // Handle disconnect
      ws.on('close', () => {
        this.removeClient(tenantId, docName, ws);
        
        // Track metrics
        metricsCollector.increment('yjs.client.disconnected', {
          tenantId
        });
      });
      
      // Additional cleanup
      req.socket.on('error', (err) => {
        console.error(`Socket error for tenant ${tenantId}, document ${docName}:`, err);
        this.removeClient(tenantId, docName, ws);
      });
    } catch (error) {
      console.error('Error handling WebSocket connection:', error);
      ws.close(1011, 'Internal server error');
    }
  }
  
  /**
   * Add a client to tracking collections
   */
  private addClient(tenantId: string, docName: string, ws: WebSocket) {
    // Track by tenant
    if (!this.clientsByTenant.has(tenantId)) {
      this.clientsByTenant.set(tenantId, new Set());
    }
    this.clientsByTenant.get(tenantId)!.add(ws);
    
    // Track by document
    const fullDocName = `${tenantId}-${docName}`;
    if (!this.clientsByDocument.has(fullDocName)) {
      this.clientsByDocument.set(fullDocName, new Set());
    }
    this.clientsByDocument.get(fullDocName)!.add(ws);
    
    // Track documents by tenant
    if (!this.documentsByTenant.has(tenantId)) {
      this.documentsByTenant.set(tenantId, new Set());
    }
    this.documentsByTenant.get(tenantId)!.add(docName);
  }
  
  /**
   * Remove a client from tracking collections
   */
  private removeClient(tenantId: string, docName: string, ws: WebSocket) {
    // Remove from tenant tracking
    const tenantClients = this.clientsByTenant.get(tenantId);
    if (tenantClients) {
      tenantClients.delete(ws);
      if (tenantClients.size === 0) {
        this.clientsByTenant.delete(tenantId);
      }
    }
    
    // Remove from document tracking
    const fullDocName = `${tenantId}-${docName}`;
    const docClients = this.clientsByDocument.get(fullDocName);
    if (docClients) {
      docClients.delete(ws);
      if (docClients.size === 0) {
        this.clientsByDocument.delete(fullDocName);
        
        // Remove from documents by tenant tracking
        const tenantDocs = this.documentsByTenant.get(tenantId);
        if (tenantDocs) {
          tenantDocs.delete(docName);
          if (tenantDocs.size === 0) {
            this.documentsByTenant.delete(tenantId);
          }
        }
      }
    }
  }
  
  /**
   * Set up ping interval to keep connections alive
   */
  private setupPingInterval() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    this.pingInterval = setInterval(() => {
      if (this.wss) {
        this.wss.clients.forEach((client) => {
          if (client.readyState === client.OPEN) {
            client.ping();
          }
        });
      }
    }, this.config.pingInterval);
  }
  
  /**
   * Stop the YJS WebSocket server
   */
  async stop(): Promise<void> {
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Close all connections
    if (this.wss) {
      await new Promise<void>((resolve) => {
        this.wss!.close(() => {
          resolve();
        });
      });
      this.wss = null;
    }
    
    // Close HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer!.close(() => {
          resolve();
        });
      });
      this.httpServer = null;
    }
    
    // Close Redis connection
    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }
    
    // Close persistence
    if (this.persistence && this.persistence.provider && this.persistence.provider.close) {
      await this.persistence.provider.close();
      this.persistence = null;
    }
    
    // Record server shutdown
    metricsCollector.increment('yjs.server.stopped');
    
    // Log compliance event
    await ComplianceLogger.log({
      eventType: 'yjs.server.stopped',
      resourceId: 'yjs-server',
      description: 'YJS WebSocket server stopped'
    });
  }
  
  /**
   * Disconnect all clients for a specific tenant
   */
  async disconnectTenant(tenantId: string): Promise<number> {
    const clients = this.clientsByTenant.get(tenantId);
    if (!clients) return 0;
    
    const count = clients.size;
    clients.forEach((client: any) => {
      client.close(1000, 'Tenant disconnected by administrator');
    });
    
    // Log the tenant disconnect event
    await ComplianceLogger.log({
      eventType: 'yjs.tenant.disconnected',
      resourceId: tenantId,
      description: `Tenant ${tenantId} forcibly disconnected from YJS server`,
      metadata: {
        clientCount: count
      }
    });
    
    return count;
  }
  
  /**
   * Export document data for a specific document
   */
  async exportDocument(tenantId: string, docName: string): Promise<Buffer | null> {
    if (!this.persistence) return null;
    
    try {
      const fullDocName = `${tenantId}-${docName}`;
      const docState = await getPersistence().getYDoc(fullDocName);
      if (!docState) return null;
      
      // Convert to binary form for export
      const stateBuffer = Buffer.from(Y.encodeStateAsUpdate(docState));
      
      // Log the export
      await ComplianceLogger.log({
        eventType: 'yjs.document.exported',
        resourceId: docName,
        description: `Document ${docName} exported from YJS server`,
        metadata: {
          tenantId,
          sizeBytes: stateBuffer.length
        }
      });
      
      return stateBuffer;
    } catch (err) {
      console.error(`Error exporting document ${docName} for tenant ${tenantId}:`, err);
      
      // Log failure
      await ComplianceLogger.log({
        eventType: 'yjs.document.export.failed',
        resourceId: docName,
        description: `Failed to export document ${docName}`,
        metadata: {
          tenantId,
          error: err instanceof Error ? err.message : String(err)
        }
      });
      
      return null;
    }
  }
}

// Singleton instance for server
let serverInstance: YjsWebSocketServer | null = null;

/**
 * Get or create the YJS WebSocket server instance
 */
export function getYjsServer(config?: YjsServerConfig): YjsWebSocketServer {
  if (!serverInstance) {
    serverInstance = new YjsWebSocketServer(config);
  }
  return serverInstance;
}