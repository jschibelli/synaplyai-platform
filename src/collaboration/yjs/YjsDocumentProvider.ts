import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { TokenState, Token } from '../tokens/TokenStateManager';
import { metricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenant-context';
import { ComplianceLogger } from '../../lib/compliance-logger';
import { z } from 'zod';

// Schema for token validation
const tokenSchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  position: z.number().int(),
  length: z.number().int().positive(),
  metadata: z.object({
    state: z.enum([
      TokenState.DEFAULT, 
      TokenState.ACCEPTED, 
      TokenState.REJECTED, 
      TokenState.CONFLICT, 
      TokenState.PENDING, 
      TokenState.AI_GENERATED
    ]),
    userId: z.string().optional(),
    timestamp: z.number().optional(),
    sourceId: z.string().optional(),
    conflictIds: z.array(z.string()).optional(),
    confidence: z.number().min(0).max(1).optional()
  })
});

/**
 * Configuration options for YjsDocumentProvider
 */
export interface YjsDocumentOptions {
  documentId: string;
  userId: string;
  username?: string;
  websocketUrl?: string;
  color?: string;
  tenantId?: string;
  offlineEnabled?: boolean;
  securityKey?: string;
}

/**
 * Cursor information type with position and selection
 */
export interface CursorInfo {
  position: number;
  selection?: {
    start: number;
    end: number;
  };
}

/**
 * User awareness information
 */
export interface UserAwareness {
  userId: string;
  username: string;
  color: string;
  cursor: CursorInfo | null;
  clientId: number;
}

/**
 * Provides YJS integration for collaborative document editing
 */
export class YjsDocumentProvider {
  private doc: Y.Doc;
  private websocketProvider?: WebsocketProvider;
  private indexeddbProvider?: IndexeddbPersistence;
  private userId: string;
  private username: string;
  private documentId: string;
  private tenantId: string;
  private isConnected: boolean = false;
  private isInitialized: boolean = false;
  private readyPromise: Promise<void>;
  private resolveReady!: () => void;
  
  // YJS shared data structures
  private yText: Y.Text;           // Document content
  private yTokens: Y.Map<Token>;   // Token metadata
  private yAwareness: any;         // User awareness info
  
  // Event listeners
  private listeners: Map<string, Set<Function>> = new Map();
  
  /**
   * Creates a new YJS document provider for real-time collaboration
   */
  constructor(options: YjsDocumentOptions) {
    const startTime = performance.now();
    
    this.documentId = options.documentId;
    this.userId = options.userId;
    this.username = options.username || `User ${this.userId.substring(0, 5)}`;
    
    // Get tenant context
    const tenantContext = getTenantContext();
    this.tenantId = options.tenantId || tenantContext?.tenantId || 'default';
    
    // Setup ready promise
    this.readyPromise = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    
    // Initialize YJS document
    this.doc = new Y.Doc();
    
    // Setup shared data structures
    this.yText = this.doc.getText('content');
    this.yTokens = this.doc.getMap('tokens');
    
    // Setup websocket provider if URL is provided
    if (options.websocketUrl) {
      this.setupWebsocketProvider(options.websocketUrl, options.color);
    }
    
    // Setup IndexedDB provider if offline is enabled
    if (options.offlineEnabled !== false) {
      this.setupIndexedDBProvider();
    }
    
    // Register event listeners
    this.registerEventListeners();
    
    // Mark as initialized once setup is complete
    setTimeout(() => {
      this.isInitialized = true;
      this.resolveReady();
      
      // Record initialization metrics
      const duration = performance.now() - startTime;
      metricsCollector.recordValue('yjs.provider.init.duration', duration, {
        tenantId: this.tenantId,
        documentId: this.documentId
      });
    }, 100);
    
    // Log initialization
    ComplianceLogger.log({
      eventType: 'yjs.provider.initialized',
      resourceId: this.documentId,
      description: `YJS document provider initialized for document ${this.documentId}`,
      metadata: {
        tenantId: this.tenantId,
        userId: this.userId,
        offlineEnabled: options.offlineEnabled !== false
      }
    }).catch(err => console.error('Failed to log YJS provider initialization:', err));
  }
  
  /**
   * Wait until the provider is ready
   */
  async waitUntilReady(): Promise<void> {
    return this.readyPromise;
  }
  
  /**
   * Setup websocket provider for real-time collaboration
   */
  private setupWebsocketProvider(url: string, color?: string) {
    try {
      // Create query parameters
      const params = new URLSearchParams();
      params.set('tenantId', this.tenantId);
      params.set('docName', this.documentId);
      
      // Create websocket URL with params
      const wsUrl = `${url}?${params.toString()}`;
      
      // Setup websocket provider
      this.websocketProvider = new WebsocketProvider(
        wsUrl,
        this.documentId,
        this.doc
      );
      
      // Get awareness instance
      this.yAwareness = this.websocketProvider.awareness;
      
      // Set local user information
      this.yAwareness.setLocalState({
        userId: this.userId,
        username: this.username,
        color: color || this.getRandomColor(),
        cursor: null
      });
      
      // Handle connection state changes
      this.websocketProvider.on('status', (event: { status: string }) => {
        const isConnected = event.status === 'connected';
        
        // Only emit event if the state actually changed
        if (this.isConnected !== isConnected) {
          this.isConnected = isConnected;
          this.emit('connectionStateChanged', this.isConnected);
          
          // Record connection state change
          metricsCollector.increment(`yjs.connection.${isConnected ? 'connected' : 'disconnected'}`, {
            tenantId: this.tenantId,
            documentId: this.documentId
          });
        }
      });
      
      // Handle synced event
      this.websocketProvider.on('synced', (isSynced: boolean) => {
        if (isSynced) {
          this.emit('synced');
        }
      });
    } catch (error) {
      console.error('Error setting up YJS websocket provider:', error);
      
      // Record error
      metricsCollector.increment('yjs.connection.error', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Emit connection error event
      this.emit('connectionError', error);
    }
  }
  
  /**
   * Setup IndexedDB provider for offline persistence
   */
  private setupIndexedDBProvider() {
    try {
      // Create namespaced IndexedDB storage
      const storeName = `yjs-${this.tenantId}`;
      const docName = `doc-${this.documentId}`;
      
      this.indexeddbProvider = new IndexeddbPersistence(storeName, docName);
      
      this.indexeddbProvider.on('synced', () => {
        this.emit('persistenceSynced');
        
        // Record sync event
        metricsCollector.increment('yjs.persistence.synced', {
          tenantId: this.tenantId,
          documentId: this.documentId
        });
      });
    } catch (error) {
      console.error('Error setting up YJS IndexedDB provider:', error);
      
      // Record error
      metricsCollector.increment('yjs.persistence.error', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Emit persistence error event
      this.emit('persistenceError', error);
    }
  }
  
  /**
   * Register event listeners for shared data structures
   */
  private registerEventListeners() {
    // Listen for text changes
    this.yText.observe(this.handleTextChange.bind(this));
    
    // Listen for token changes
    this.yTokens.observe(this.handleTokenChange.bind(this));
    
    // Listen for awareness changes if available
    if (this.yAwareness) {
      this.yAwareness.on('change', this.handleAwarenessChange.bind(this));
    }
  }
  
  /**
   * Handle text changes
   */
  private handleTextChange(event: Y.YTextEvent) {
    // Extract delta changes
    const delta = event.delta;
    
    // Emit text changed event with delta
    this.emit('textChanged', {
      delta,
      origin: event.origin,
      isLocal: event.origin === 'local'
    });
    
    // Record text change
    metricsCollector.increment('yjs.text.changed', {
      tenantId: this.tenantId,
      documentId: this.documentId,
      isLocal: event.origin === 'local' ? 'true' : 'false'
    });
  }
  
  /**
   * Handle token changes
   */
  private handleTokenChange(event: Y.YMapEvent<Token>) {
    // Process the changes by action type
    const added: Map<string, Token> = new Map();
    const updated: Map<string, Token> = new Map();
    const deleted: Set<string> = new Set();
    
    // Process each key change
    event.keysChanged.forEach(key => {
      const token = this.yTokens.get(key);
      
      if (!token) {
        // Token was deleted
        deleted.add(key);
      } else if (event.transaction.local) {
        // Local change - do nothing special for now
        if (!this.hasToken(key)) {
          added.set(key, token);
        } else {
          updated.set(key, token);
        }
      } else {
        // Remote change - validate token
        try {
          // Validate token structure
          tokenSchema.parse(token);
          
          if (!this.hasToken(key)) {
            added.set(key, token);
          } else {
            updated.set(key, token);
          }
        } catch (err) {
          console.error(`Invalid token data received for ${key}:`, err);
          
          // Record validation error
          metricsCollector.increment('yjs.token.validation.error', {
            tenantId: this.tenantId,
            documentId: this.documentId
          });
        }
      }
    });
    
    // Emit token changed event with categorized changes
    this.emit('tokensChanged', {
      added,
      updated,
      deleted,
      origin: event.origin
    });
    
    // Track token changes in metrics
    if (added.size > 0) {
      metricsCollector.increment('yjs.tokens.added', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        count: added.size.toString()
      });
    }
    
    if (updated.size > 0) {
      metricsCollector.increment('yjs.tokens.updated', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        count: updated.size.toString()
      });
    }
    
    if (deleted.size > 0) {
      metricsCollector.increment('yjs.tokens.deleted', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        count: deleted.size.toString()
      });
    }
  }
  
  /**
   * Handle awareness changes (cursor positions, etc)
   */
  private handleAwarenessChange() {
    if (!this.yAwareness) return;
    
    // Map awareness states to user information
    const users: UserAwareness[] = Array.from(this.yAwareness.getStates().entries())
      .filter(([_, state]: [number, any]) => state !== null)
      .map(([clientId, state]: [number, any]) => ({
        clientId,
        userId: state.userId,
        username: state.username || `User ${state.userId.substring(0, 5)}`,
        color: state.color || '#999999',
        cursor: state.cursor
      }));
    
    // Emit awareness changed event with user list
    this.emit('awarenessChanged', { users });
  }
  
  /**
   * Check if a token exists
   */
  private hasToken(tokenId: string): boolean {
    return this.yTokens.has(tokenId);
  }
  
  /**
   * Update the text content
   */
  updateText(text: string): void {
    if (!this.isInitialized) return;
    
    const startTime = performance.now();
    
    // Apply transaction to batch operations
    this.doc.transact(() => {
      // Clear existing content
      this.yText.delete(0, this.yText.length);
      
      // Insert new content
      this.yText.insert(0, text);
    }, 'local');
    
    // Record performance metrics
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('yjs.text.update.duration', duration, {
      tenantId: this.tenantId,
      documentId: this.documentId,
      textLength: text.length.toString()
    });
  }
  
  /**
   * Apply text changes described by delta operations
   */
  applyTextDelta(delta: Array<{insert?: string, delete?: number, retain?: number}>): void {
    if (!this.isInitialized || !delta || !Array.isArray(delta)) return;
    
    const startTime = performance.now();
    
    // Apply transaction to batch operations
    this.doc.transact(() => {
      let index = 0;
      
      for (const op of delta) {
        if (op.delete) {
          // Delete operation
          this.yText.delete(index, op.delete);
        } else if (op.insert) {
          // Insert operation
          this.yText.insert(index, op.insert);
          index += op.insert.length;
        } else if (op.retain) {
          // Retain (move cursor forward)
          index += op.retain;
        }
      }
    }, 'local');
    
    // Record performance metrics
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('yjs.text.delta.duration', duration, {
      tenantId: this.tenantId,
      documentId: this.documentId,
      operationCount: delta.length.toString()
    });
  }
  
  /**
   * Get current text content
   */
  getText(): string {
    return this.yText.toString();
  }
  
  /**
   * Set a token in the shared tokens map
   */
  setToken(token: Token): void {
    if (!this.isInitialized) return;
    
    try {
      // Validate token structure
      tokenSchema.parse(token);
      
      // Apply the operation
      this.yTokens.set(token.id, token);
    } catch (err) {
      console.error('Invalid token structure:', err);
      
      // Record validation error
      metricsCollector.increment('yjs.token.validation.error', {
        tenantId: this.tenantId,
        documentId: this.documentId
      });
      
      throw new Error('Invalid token structure');
    }
  }
  
  /**
   * Update a token's state
   */
  updateTokenState(tokenId: string, newState: TokenState): boolean {
    if (!this.isInitialized) return false;
    
    const token = this.getToken(tokenId);
    if (!token) return false;
    
    // Create updated token with new state
    const updatedToken: Token = {
      ...token,
      metadata: {
        ...token.metadata,
        state: newState,
        timestamp: Date.now() // Update timestamp to mark the change
      }
    };
    
    // Update the token in the shared map
    this.setToken(updatedToken);
    return true;
  }
  
  /**
   * Delete a token
   */
  deleteToken(tokenId: string): boolean {
    if (!this.isInitialized) return false;
    
    if (this.hasToken(tokenId)) {
      this.yTokens.delete(tokenId);
      return true;
    }
    return false;
  }
  
  /**
   * Get a token by ID
   */
  getToken(tokenId: string): Token | undefined {
    return this.yTokens.get(tokenId);
  }
  
  /**
   * Get all tokens
   */
  getAllTokens(): Token[] {
    return Array.from(this.yTokens.values());
  }
  
  /**
   * Update cursor position
   */
  updateCursor(position: number | null, selection?: { start: number, end: number }): void {
    if (!this.yAwareness) return;
    
    const currentState = this.yAwareness.getLocalState() || {};
    
    this.yAwareness.setLocalState({
      ...currentState,
      cursor: position !== null ? { position, selection } : null
    });
  }
  
  /**
   * Get all user awareness information (for showing cursors)
   */
  getUsers(): UserAwareness[] {
    if (!this.yAwareness) return [];
    
    return Array.from(this.yAwareness.getStates().entries())
      .filter(([_, state]: [number, any]) => state !== null)
      .map(([clientId, state]: [number, any]) => ({
        clientId,
        userId: state.userId,
        username: state.username || `User ${state.userId.substring(0, 5)}`,
        color: state.color || '#999999',
        cursor: state.cursor
      }));
  }
  
  /**
   * Register an event listener
   */
  on(eventName: string, handler: Function): void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, new Set());
    }
    
    this.listeners.get(eventName)!.add(handler);
  }
  
  /**
   * Remove an event listener
   */
  off(eventName: string, handler: Function): void {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      handlers.delete(handler);
    }
  }
  
  /**
   * Emit an event to registered listeners
   */
  private emit(eventName: string, data?: any): void {
    const handlers = this.listeners.get(eventName);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in YJS event handler for ${eventName}:`, error);
        }
      });
    }
  }
  
  /**
   * Generate a random color for user identification
   */
  private getRandomColor(): string {
    const colors = [
      '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
      '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
      '#8bc34a', '#cddc39', '#ffc107', '#ff9800', '#ff5722'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }
  
  /**
   * Check if provider is connected to WebSocket server
   */
  isWebsocketConnected(): boolean {
    return this.isConnected;
  }
  
  /**
   * Force synchronization with persistence layer
   */
  async forceSyncPersistence(): Promise<void> {
    if (this.indexeddbProvider) {
      // Wait for IndexedDB to sync
      await new Promise<void>((resolve) => {
        const onSynced = () => {
          this.indexeddbProvider!.off('synced', onSynced);
          resolve();
        };
        
        this.indexeddbProvider.on('synced', onSynced);
        // Trigger sync
        this.indexeddbProvider.sync();
      });
    }
  }
  
  /**
   * Destroy the provider and clean up resources
   */
  destroy(): void {
    // Disconnect from WebSocket server
    if (this.websocketProvider) {
      this.websocketProvider.disconnect();
      this.websocketProvider = undefined;
    }
    
    // Clear awareness state
    if (this.yAwareness) {
      this.yAwareness.setLocalState(null);
      this.yAwareness = undefined;
    }
    
    // Close IndexedDB provider
    if (this.indexeddbProvider) {
      this.indexeddbProvider.destroy();
      this.indexeddbProvider = undefined;
    }
    
    // Clear event listeners
    this.listeners.clear();
    
    // Destroy the YJS document
    this.doc.destroy();
    
    // Record cleanup
    metricsCollector.increment('yjs.provider.destroyed', {
      tenantId: this.tenantId,
      documentId: this.documentId
    });
  }
}