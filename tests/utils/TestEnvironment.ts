import { EventEmitter } from 'events';
import { gzipSync, gunzipSync, deflateSync, inflateSync } from 'zlib';
import WebSocket from 'ws';
import { performance, PerformanceObserver } from 'perf_hooks';
import Redis from 'ioredis';

/**
 * Test environment for running performance and load tests
 * Simulates all core system components needed for comprehensive testing
 */
export class TestEnvironment {
  private documents: Map<string, any> = new Map();
  private users: Map<string, any> = new Map();
  private tenants: Map<string, any> = new Map();
  private events: any[] = [];
  private eventEmitter = new EventEmitter();
  private wsServer: WebSocket.Server;
  private redisClient: Redis;

  constructor(port: number) {
    this.redisClient = new Redis();
    this.redisClient.on('error', (err) => {
      console.error('Redis connection error:', err);
    });
    this.wsServer = new WebSocket.Server({ port }); // Use dynamic port
  }

  /**
   * Create a new test environment with configured parameters
   */
  static async create(options: {
    tenants: number;
    usersPerTenant: number;
    documentsPerUser: number;
  }): Promise<TestEnvironment> {
    const port = Math.floor(Math.random() * (65535 - 1024 + 1)) + 1024; // Random port between 1024 and 65535
    const env = new TestEnvironment(port);
    
    // Set up tenants
    for (let t = 0; t < options.tenants; t++) {
      const tenantId = `tenant-${t}`;
      env.tenants.set(tenantId, {
        id: tenantId,
        name: `Test Tenant ${t}`,
        settings: {
          maxTokens: 100000,
          maxUsers: 50,
          circuitBreakerThreshold: 10
        }
      });
      
      // Set up users for this tenant
      for (let u = 0; u < options.usersPerTenant; u++) {
        const userId = `user-${t}-${u}`;
        env.users.set(userId, {
          id: userId,
          tenantId,
          name: `User ${u}`,
          email: `user${u}@tenant${t}.example.com`
        });
        
        // Set up documents for this user
        for (let d = 0; d < options.documentsPerUser; d++) {
          const documentId = `doc-${t}-${u}-${d}`;
          env.documents.set(documentId, {
            id: documentId,
            tenantId,
            ownerId: userId,
            content: `Test document ${d} content for user ${u} in tenant ${t}.`,
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            tokens: [],
            metadata: {}
          });
        }
      }
    }
    
    // Set up WebSocket server
    env.wsServer.on('connection', (ws) => {
      ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        env.handleWebSocketMessage(ws, data);
      });
    });

    return env;
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleWebSocketMessage(ws: WebSocket, data: any): void {
    // Handle different message types
    switch (data.type) {
      case 'edit':
        this.handleEditMessage(ws, data);
        break;
      case 'ai_command':
        this.handleAiCommandMessage(ws, data);
        break;
      default:
        console.warn(`Unknown message type: ${data.type}`);
    }
  }

  /**
   * Handle edit messages
   */
  private handleEditMessage(ws: WebSocket, data: any): void {
    const { userId, documentId, payload } = data;
    
    // Simulate processing delay
    setTimeout(() => {
      // Get document
      const document = this.documents.get(documentId);
      if (!document) {
        ws.send(JSON.stringify({ error: `Document not found: ${documentId}` }));
        return;
      }
      
      // Update document version
      document.version += 1;
      document.updatedAt = new Date();
      
      // Simulate result
      const result = {
        commandId: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        documentId,
        userId,
        status: 'success',
        version: document.version
      };
      
      // Broadcast update to all connected clients
      this.broadcastUpdate(result);
    }, Math.random() * 30 + 10);
  }

  /**
   * Handle AI command messages
   */
  private handleAiCommandMessage(ws: WebSocket, data: any): void {
    const { userId, commandType, documentId, payload } = data;
    
    // Simulate processing delay
    setTimeout(() => {
      // Get document
      const document = this.documents.get(documentId);
      if (!document) {
        ws.send(JSON.stringify({ error: `Document not found: ${documentId}` }));
        return;
      }
      
      // Simulate result based on command type
      const result = {
        commandId: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
        documentId,
        userId,
        commandType,
        status: 'success',
        processingTime: Math.random() * 400 + 100, // 100-500ms
        tokenUsage: Math.floor(Math.random() * 100) + 50,
        result: `AI result for ${commandType}`
      };
      
      // Broadcast update to all connected clients
      this.broadcastUpdate(result);
    }, Math.random() * 50 + 20);
  }

  /**
   * Broadcast update to all connected clients
   */
  private broadcastUpdate(data: any): void {
    const message = JSON.stringify(data);
    const compressedMessage = deflateSync(Buffer.from(message)).toString('base64');
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(compressedMessage);
      }
    });
  }

  /**
   * Execute an AI command in the test environment
   */
  async executeAiCommand(params: {
    userId: string;
    commandType: string;
    documentId: string;
    payload: any;
  }): Promise<any> {
    const { userId, commandType, documentId, payload } = params;
    
    // Record event for metrics
    this.events.push({
      type: 'ai_command',
      userId,
      commandType,
      documentId,
      timestamp: Date.now()
    });
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 20));
    
    // Get document
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }
    
    // Simulate result based on command type
    const result = {
      commandId: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
      documentId,
      userId,
      commandType,
      status: 'success',
      processingTime: Math.random() * 400 + 100, // 100-500ms
      tokenUsage: Math.floor(Math.random() * 100) + 50,
      result: `AI result for ${commandType}`
    };
    
    // Emit event
    this.eventEmitter.emit('ai_command_completed', result);
    
    return result;
  }

  /**
   * Execute a document edit command in the test environment
   */
  async executeEditCommand(params: {
    userId: string;
    commandType: string;
    documentId: string;
    payload: any;
  }): Promise<any> {
    const { userId, commandType, documentId, payload } = params;
    
    // Record event
    this.events.push({
      type: 'edit_command',
      userId,
      commandType,
      documentId,
      timestamp: Date.now()
    });
    
    // Simulate processing delay
    await new Promise(resolve => setTimeout(resolve, Math.random() * 30 + 10));
    
    // Get document
    const document = this.documents.get(documentId);
    if (!document) {
      throw new Error(`Document not found: ${documentId}`);
    }
    
    // Update document version
    document.version += 1;
    document.updatedAt = new Date();
    
    // Simulate result
    const result = {
      commandId: `cmd-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`,
      documentId,
      userId,
      commandType,
      status: 'success',
      version: document.version
    };
    
    // Simulate conflict occasionally
    if (Math.random() < 0.05) {
      this.events.push({
        type: 'conflict_detected',
        documentId,
        userId,
        timestamp: Date.now()
      });
    }
    
    return result;
  }

  /**
   * Collect Redis metrics from the test run
   */
  async collectRedisMetrics(): Promise<any> {
    // Simulate collecting Redis metrics
    const aiCommands = this.events.filter(e => e.type === 'ai_command').length;
    const editCommands = this.events.filter(e => e.type === 'edit_command').length;
    
    return {
      operations: aiCommands + editCommands,
      aiCommands,
      editCommands,
      latencyP50: Math.random() * 20 + 5,
      latencyP95: Math.random() * 50 + 30,
      latencyP99: Math.random() * 100 + 80,
      redisMemoryUsage: `${Math.floor(Math.random() * 100) + 50}MB`,
      connectionCount: Math.floor(Math.random() * 20) + 5
    };
  }

  /**
   * Collect AI processing metrics from the test run
   */
  async collectAiMetrics(): Promise<any> {
    // Simulate AI metrics collection
    const aiCommands = this.events.filter(e => e.type === 'ai_command');
    
    return {
      totalCommands: aiCommands.length,
      commandsPerType: {
        'ai.complete': aiCommands.filter(e => e.commandType === 'ai.complete').length,
        'ai.summarize': aiCommands.filter(e => e.commandType === 'ai.summarize').length,
        'ai.rephrase': aiCommands.filter(e => e.commandType === 'ai.rephrase').length,
        'ai.improveGrammar': aiCommands.filter(e => e.commandType === 'ai.improveGrammar').length,
        'ai.suggest': aiCommands.filter(e => e.commandType === 'ai.suggest').length,
      },
      averageLatency: Math.random() * 300 + 150,
      latencyP95: Math.random() * 100 + 400,
      tokenUsage: Math.floor(Math.random() * 5000) + 1000
    };
  }

  /**
   * Collect conflict resolution metrics from the test run
   */
  async collectConflictMetrics(): Promise<any> {
    // Simulate conflict metrics
    const conflictEvents = this.events.filter(e => e.type === 'conflict_detected');
    const totalConflicts = conflictEvents.length;
    
    // Successful conflict resolutions (95-99%)
    const successRate = Math.random() * 0.04 + 0.95;
    const successfulResolutions = Math.floor(totalConflicts * successRate);
    
    return {
      totalConflicts,
      successfulResolutions,
      failedResolutions: totalConflicts - successfulResolutions,
      resolutionTimeAvg: Math.random() * 50 + 30,
      resolutionTimeP95: Math.random() * 100 + 80,
      autoResolved: Math.floor(totalConflicts * 0.7),
      manuallyResolved: Math.floor(totalConflicts * 0.3),
      conflictsByType: {
        'text': Math.floor(totalConflicts * 0.6),
        'format': Math.floor(totalConflicts * 0.2),
        'structure': Math.floor(totalConflicts * 0.2)
      }
    };
  }

  /**
   * Profile and monitor performance of specific functions
   */
  static profileFunction<T extends (...args: any[]) => Promise<any>>(fn: T, label: string): T {
    return (async function(...args: Parameters<T>): Promise<ReturnType<T>> {
      const start = performance.now();
      const result = await fn(...args);
      const duration = performance.now() - start;
      console.log(`${label} took ${duration.toFixed(2)}ms`);
      return result;
    }) as T;
  }
}

// Example usage of profiling
(async () => {
  const testEnv = await TestEnvironment.create({ tenants: 5, usersPerTenant: 10, documentsPerUser: 3 });
  testEnv.executeAiCommand = TestEnvironment.profileFunction(testEnv.executeAiCommand, 'executeAiCommand');
  testEnv.executeEditCommand = TestEnvironment.profileFunction(testEnv.executeEditCommand, 'executeEditCommand');
})();