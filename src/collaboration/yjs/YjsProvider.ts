import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Token, TokenState } from '../tokens/TokenStateManager';
import { metricsCollector } from '../../metrics/metrics-collector';

export interface YjsProviderOptions {
  documentId: string;
  userId: string;
  username?: string;
  websocketUrl?: string;
  color?: string;
  tenantId: string;
}

/**
 * Provides YJS integration for collaborative document editing with token state management
 */
export class YjsProvider {
  private doc: Y.Doc;
  private websocketProvider: WebsocketProvider;
  private indexeddbProvider: IndexeddbPersistence;
  private userId: string;
  private documentId: string;
  private tenantId: string;
  private eventCallbacks: Map<string, Set<Function>> = new Map();
  
  // YJS shared data structures
  public yText: Y.Text;         // Document content as YText
  public yTokens: Y.Map<Token>; // Token metadata indexed by ID
  public yUndoManager: Y.UndoManager;
  
  /**
   * Creates a new YJS provider
   */
  constructor(options: YjsProviderOptions) {
    const startTime = performance.now();
    
    this.documentId = options.documentId;
    this.userId = options.userId;
    this.tenantId = options.tenantId;
    
    // Initialize YJS document
    this.doc = new Y.Doc();
    
    // Initialize shared data structures
    this.yText = this.doc.getText('content');
    this.yTokens = this.doc.getMap('tokens');
    
    // Initialize undo manager (excluding awareness)
    this.yUndoManager = new Y.UndoManager([this.yText, this.yTokens], {
      captureTimeout: 500 // Group changes made within 500ms as one undo step
    });
    
    // Set up the websocket provider with tenant isolation
    const websocketUrl = options.websocketUrl || 'ws://localhost:1234';
    this.websocketProvider = new WebsocketProvider(
      websocketUrl,
      `${this.documentId}`,
      this.doc,
      {
        params: { tenantId: this.tenantId },
        awareness: {
          // Initial local state
          local: {
            userId: this.userId,
            name: options.username || `User ${this.userId.substring(0, 5)}`,
            color: options.color || this.getRandomColor(),
            cursor: null
          }
        }
      }
    );
    
    // Set up IndexedDB provider for offline persistence
    // Use tenant-scoped storage
    const storeName = `${this.tenantId}-docs`;
    this.indexeddbProvider = new IndexeddbPersistence(storeName, this.doc);
    
    // Set up event listeners
    this.setupEventListeners();
    
    // Record performance metrics
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('yjs.provider.init.duration', duration, {
      tenantId: this.tenantId,
      documentId: this.documentId
    });
  }
  
  /**
   * Set up event listeners for YJS data structures
   */
  private setupEventListeners() {
    // Listen for text changes
    this.yText.observe(event => {
      this.emit('textChanged', {
        delta: event.delta,
        origin: event.origin
      });
      
      metricsCollector.increment('yjs.text.changed', {
        tenantId: this.tenantId,
        documentId: this.documentId
      });
    });
    
    // Listen for token metadata changes
    this.yTokens.observe(event => {
      const changes = {
        added: new Map<string, Token>(),
        updated: new Map<string, Token>(),
        deleted: new Set<string>()
      };
      
      event.keysChanged.forEach(key => {
        if (this.yTokens.has(key)) {
          if (event.transaction.beforeState.has(key)) {
            changes.updated.set(key, this.yTokens.get(key) as Token);
          } else {
            changes.added.set(key, this.yTokens.get(key) as Token);
          }
        } else if (event.transaction.beforeState.has(key)) {
          changes.deleted.add(key);
        }
      });
      
      this.emit('tokensChanged', {
        changes,
        origin: event.origin
      });
      
      // Track token changes
      metricsCollector.increment('yjs.tokens.changed', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        addedCount: changes.added.size.toString(),
        updatedCount: changes.updated.size.toString(),
        deletedCount: changes.deleted.size.toString()
      });
    });
    
    // Listen for awareness changes (cursor positions, etc.)
    this.websocketProvider.awareness.on('change', () => {
      const states = this.websocketProvider.awareness.getStates();
      const users = Array.from(states.entries())
        .map(([clientId, state]) => {
          if (!state) return null;
          return {
            clientId,
            userId: state.userId,
            name: state.name,
            color: state.color,
            cursor: state.cursor
          };
        })
        .filter(Boolean);
      
      this.emit('awarenessChanged', { users });
    });
    
    // Listen for connection status changes
    this.websocketProvider.on('status', ({ status }: { status: string }) => {
      const isConnected = status === 'connected';
      this.emit('connectionStateChanged', isConnected);
      
      metricsCollector.increment('yjs.connection.state', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        state: status
      });
    });
    
    // Listen for sync completion
    this.indexeddbProvider.on('synced', () => {
      this.emit('synced');
      
      metricsCollector.increment('yjs.persistence.synced', {
        tenantId: this.tenantId,
        documentId: this.documentId
      });
    });
  }
  
  /**
   * Get the full document text
   */
  getText(): string {
    return this.yText.toString();
  }
  
  /**
   * Update the document text (with optional origin for tracking)
   */
  updateText(text: string, origin?: any) {
    const startTime = performance.now();
    
    // Apply transaction to batch operations
    this.doc.transact(() => {
      // Clear existing content
      this.yText.delete(0, this.yText.length);
      
      // Insert new content
      this.yText.insert(0, text);
    }, origin);
    
    // Record performance metrics
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('yjs.text.update.duration', duration, {
      tenantId: this.tenantId,
      documentId: this.documentId,
      textLength: text.length.toString()
    });
  }
  
  /**
   * Set a token in the shared tokens map
   */
  setToken(token: Token) {
    this.yTokens.set(token.id, token);
  }
  
  /**
   * Update a token's state
   */
  updateTokenState(tokenId: string, newState: TokenState) {
    const token = this.yTokens.get(tokenId);
    if (token) {
      // Create updated token with new state
      const updatedToken: Token = {
        ...token,
        metadata: {
          ...token.metadata,
          state: newState
        }
      };
      
      // Update the token in the shared map
      this.yTokens.set(tokenId, updatedToken);
      
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
   * Update the cursor position for the current user
   */
  updateCursor(position: number | null, selection?: { start: number, end: number }) {
    this.websocketProvider.awareness.setLocalState({
      ...this.websocketProvider.awareness.getLocalState(),
      cursor: position !== null ? { 
        position,
        selection
      } : null
    });
  }
  
  /**
   * Get all user cursors
   */
  getUserCursors() {
    const states = this.websocketProvider.awareness.getStates();
    return Array.from(states.entries())
      .filter(([_, state]) => state && state.cursor)
      .map(([clientId, state]) => ({
        clientId,
        userId: state.userId,
        name: state.name,
        color: state.color,
        cursor: state.cursor
      }));
  }
  
  /**
   * Register an event callback
   */
  on(eventName: string, callback: Function) {
    if (!this.eventCallbacks.has(eventName)) {
      this.eventCallbacks.set(eventName, new Set());
    }
    
    this.eventCallbacks.get(eventName)?.add(callback);
  }
  
  /**
   * Remove an event callback
   */
  off(eventName: string, callback: Function) {
    const callbacks = this.eventCallbacks.get(eventName);
    if (callbacks) {
      callbacks.delete(callback);
    }
  }
  
  /**
   * Emit an event to all registered callbacks
   */
  private emit(eventName: string, data?: any) {
    const callbacks = this.eventCallbacks.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in YJS event handler for ${eventName}:`, error);
        }
      });
    }
  }
  
  /**
   * Undo the last change
   */
  undo() {
    this.yUndoManager.undo();
  }
  
  /**
   * Redo the last undone change
   */
  redo() {
    this.yUndoManager.redo();
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    // Clean up awareness
    this.websocketProvider.awareness.setLocalState(null);
    
    // Disconnect
    this.websocketProvider.disconnect();
    
    // Clean up persistence
    this.indexeddbProvider.destroy();
    
    // Clean up undo manager
    this.yUndoManager.destroy();
    
    // Destroy YJS document
    this.doc.destroy();
    
    // Clean up event handlers
    this.eventCallbacks.clear();
    
    metricsCollector.increment('yjs.provider.destroyed', {
      tenantId: this.tenantId,
      documentId: this.documentId
    });
  }
  
  /**
   * Check if the provider is connected
   */
  isConnected(): boolean {
    return this.websocketProvider.wsconnected;
  }
  
  /**
   * Get a random color for user identification
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
   * Get the raw YJS document
   */
  getYDoc(): Y.Doc {
    return this.doc;
  }
}