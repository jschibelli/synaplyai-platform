import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Token, TokenState, TokenStateManager } from './tokens/TokenStateManager';
import { metricsCollector } from '../metrics/metrics-collector';
import { EventEmitter } from 'events';

/**
 * YjsDocumentProvider integrates YJS with the TokenStateManager
 * for real-time collaboration and token-level state management
 */
export class YjsDocumentProvider extends EventEmitter {
  private doc: Y.Doc;
  private wsProvider: WebsocketProvider | null = null;
  private dbProvider: IndexeddbPersistence | null = null;
  private tokenStateManager: TokenStateManager;
  private yText: Y.Text;
  private yTokens: Y.Map<Token>;
  private documentId: string;
  private tenantId: string;
  private userId: string;
  private connected: boolean = false;
  
  constructor(options: {
    documentId: string;
    tenantId: string;
    userId: string;
    tokenStateManager: TokenStateManager;
    wsUrl?: string;
  }) {
    super();
    this.documentId = options.documentId;
    this.tenantId = options.tenantId;
    this.userId = options.userId;
    this.tokenStateManager = options.tokenStateManager;
    
    // Initialize YJS document
    this.doc = new Y.Doc();
    this.yText = this.doc.getText('content');
    this.yTokens = this.doc.getMap('tokens');
    
    // Set up WebSocket provider if URL is provided
    if (options.wsUrl) {
      this.initWebsocketProvider(options.wsUrl);
    }
    
    // Set up IndexedDB persistence
    this.initIndexedDbProvider();
    
    // Set up listeners
    this.setupListeners();
  }
  
  /**
   * Initialize WebSocket provider for real-time collaboration
   */
  private initWebsocketProvider(wsUrl: string): void {
    try {
      this.wsProvider = new WebsocketProvider(
        wsUrl,
        `${this.tenantId}-${this.documentId}`,
        this.doc,
        {
          params: {
            tenantId: this.tenantId,
            documentId: this.documentId,
            userId: this.userId
          }
        }
      );
      
      // Handle connection status
      this.wsProvider.on('status', ({ status }: { status: string }) => {
        this.connected = status === 'connected';
        this.emit('connectionStatus', this.connected);
        
        metricsCollector.increment('yjs.connection.status', {
          tenantId: this.tenantId,
          documentId: this.documentId,
          status
        });
      });
      
      // Set up awareness (user presence)
      const awareness = this.wsProvider.awareness;
      
      // Update local awareness state
      awareness.setLocalState({
        userId: this.userId,
        name: `User-${this.userId.substring(0, 5)}`,
        color: this.getRandomColor()
      });
      
      // Listen for awareness updates from other users
      awareness.on('update', () => {
        const states = awareness.getStates();
        this.emit('awarenessUpdate', states);
      });
      
      metricsCollector.increment('yjs.provider.initialized', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        type: 'websocket'
      });
    } catch (error) {
      console.error('Failed to initialize WebSocket provider:', error);
      metricsCollector.increment('yjs.provider.error', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        type: 'websocket',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Initialize IndexedDB provider for offline persistence
   */
  private initIndexedDbProvider(): void {
    try {
      this.dbProvider = new IndexeddbPersistence(
        `${this.tenantId}-docs`,
        this.doc
      );
      
      this.dbProvider.on('synced', () => {
        this.emit('persistenceSynced');
        
        metricsCollector.increment('yjs.persistence.synced', {
          tenantId: this.tenantId,
          documentId: this.documentId
        });
      });
      
      metricsCollector.increment('yjs.provider.initialized', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        type: 'indexeddb'
      });
    } catch (error) {
      console.error('Failed to initialize IndexedDB provider:', error);
      metricsCollector.increment('yjs.provider.error', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        type: 'indexeddb',
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Set up listeners for YJS document changes and synchronize with TokenStateManager
   */
  private setupListeners(): void {
    // Listen for text changes
    this.yText.observe(event => {
      const content = this.yText.toString();
      this.emit('contentChanged', content);
      
      metricsCollector.increment('yjs.content.changed', {
        tenantId: this.tenantId,
        documentId: this.documentId
      });
    });
    
    // Listen for token changes
    this.yTokens.observe(event => {
      // Get tokens from YJS and update TokenStateManager
      const tokens = Array.from(this.yTokens.values());
      this.tokenStateManager.importState({ tokens });
      
      this.emit('tokensChanged', tokens);
      
      metricsCollector.increment('yjs.tokens.changed', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        tokenCount: tokens.length.toString()
      });
    });
    
    // Listen for token state changes from TokenStateManager
    this.tokenStateManager.on('tokenStateChanged', (tokenId: string, newState: TokenState) => {
      const token = this.tokenStateManager.getToken(tokenId);
      if (token) {
        // Update token in YJS map to sync with other clients
        this.yTokens.set(tokenId, token);
      }
    });
    
    // Listen for conflict detection from TokenStateManager
    this.tokenStateManager.on('conflictDetected', (conflictingTokens: Token[]) => {
      this.emit('conflictDetected', conflictingTokens);
      
      metricsCollector.increment('yjs.conflict.detected', {
        tenantId: this.tenantId,
        documentId: this.documentId,
        conflictCount: conflictingTokens.length.toString()
      });
      
      // Update tokens in YJS to reflect conflict state
      conflictingTokens.forEach(token => {
        this.yTokens.set(token.id, token);
      });
    });
  }
  
  /**
   * Update the document content
   */
  updateContent(content: string): void {
    // Apply the change to the YJS document
    // This will automatically sync to other clients
    this.doc.transact(() => {
      this.yText.delete(0, this.yText.length);
      this.yText.insert(0, content);
    });
  }
  
  /**
   * Add a new token
   */
  addToken(token: Token): void {
    this.tokenStateManager.addToken(token);
    this.yTokens.set(token.id, token);
  }
  
  /**
   * Update a token's state
   */
  updateTokenState(tokenId: string, newState: TokenState): void {
    this.tokenStateManager.updateTokenState(tokenId, newState);
    
    // Token state is updated via the tokenStateChanged event handler
  }
  
  /**
   * Get the current document content
   */
  getContent(): string {
    return this.yText.toString();
  }
  
  /**
   * Get all tokens
   */
  getTokens(): Token[] {
    return this.tokenStateManager.getAllTokens();
  }
  
  /**
   * Get a random color for user cursor
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
   * Update user cursor position for awareness
   */
  updateCursorPosition(position: number, selection?: { start: number, end: number }): void {
    if (!this.wsProvider) return;
    
    const awareness = this.wsProvider.awareness;
    const currentState = awareness.getLocalState() || {};
    
    awareness.setLocalState({
      ...currentState,
      cursor: {
        position,
        selection
      }
    });
  }
  
  /**
   * Remove cursor (when user is inactive)
   */
  removeCursor(): void {
    if (!this.wsProvider) return;
    
    const awareness = this.wsProvider.awareness;
    const currentState = awareness.getLocalState() || {};
    
    awareness.setLocalState({
      ...currentState,
      cursor: null
    });
  }
  
  /**
   * Check if connected to WebSocket server
   */
  isConnected(): boolean {
    return this.connected;
  }
  
  /**
   * Clean up resources
   */
  destroy(): void {
    if (this.wsProvider) {
      // Clear awareness state
      this.wsProvider.awareness.setLocalState(null);
      
      // Disconnect
      this.wsProvider.disconnect();
    }
    
    if (this.dbProvider) {
      this.dbProvider.destroy();
    }
    
    this.doc.destroy();
    
    // Remove all listeners
    this.removeAllListeners();
  }
}