import { useEffect, useState, useCallback, useRef } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { Token, TokenState } from '../collaboration/tokens/TokenStateManager';
import { metricsCollector } from '../metrics/metrics-collector';
import { getTenantContext } from '../lib/tenant-context';
import { useUser } from './useUser';

// Default colors for user cursors
const USER_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
  '#8bc34a', '#cddc39', '#ffc107', '#ff9800', '#ff5722'
];

export interface UserPresence {
  userId: string;
  clientId: number;
  name: string;
  color: string;
  cursor: {
    position: number;
    selection?: { start: number, end: number };
  } | null;
}

export interface YjsCollaborationOptions {
  documentId: string;
  initialContent?: string;
  onSyncError?: (error: Error) => void;
}

/**
 * A React hook for using Y.js-based real-time collaboration
 */
export function useYjsCollaboration({
  documentId,
  initialContent = '',
  onSyncError
}: YjsCollaborationOptions) {
  const { user } = useUser();
  const tenantContext = getTenantContext();
  const tenantId = tenantContext?.tenantId || 'default';
  
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [content, setContent] = useState(initialContent);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [awareness, setAwareness] = useState<UserPresence[]>([]);
  const [error, setError] = useState<Error | null>(null);
  
  // Refs to hold Y.js instances
  const docRef = useRef<Y.Doc | null>(null);
  const wsProviderRef = useRef<WebsocketProvider | null>(null);
  const dbProviderRef = useRef<IndexeddbPersistence | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const yTokensRef = useRef<Y.Map<Token> | null>(null);
  
  // Random user color
  const userColorRef = useRef(USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)]);
  
  // Initialize Y.js
  useEffect(() => {
    if (!documentId || !user?.id || isInitialized) return;
    
    const startTime = performance.now();
    
    try {
      // Create Y.js document
      const yDoc = new Y.Doc();
      docRef.current = yDoc;
      
      // Create shared document elements
      const yText = yDoc.getText('content');
      const yTokens = yDoc.getMap<Token>('tokens');
      yTextRef.current = yText;
      yTokensRef.current = yTokens;
      
      // Set up WebSocket provider for real-time collaboration
      const wsProvider = new WebsocketProvider(
        `ws://${window.location.host}/yjs`, // Connect to local WebSocket server
        `${tenantId}-${documentId}`,
        yDoc,
        {
          params: {
            tenantId,
            docName: documentId,
            userId: user.id
          }
        }
      );
      wsProviderRef.current = wsProvider;
      
      // Set up IndexedDB provider for offline persistence
      const dbProvider = new IndexeddbPersistence(
        `${tenantId}-docs`,
        yDoc
      );
      dbProviderRef.current = dbProvider;
      
      // Connection status
      wsProvider.on('status', ({ status }: { status: string }) => {
        setIsConnected(status === 'connected');
        
        if (status === 'connected') {
          metricsCollector.increment('yjs.client.connected', {
            tenantId,
            documentId
          });
        } else {
          metricsCollector.increment('yjs.client.connection_status', {
            tenantId,
            documentId,
            status
          });
        }
      });
      
      // Set awareness (user presence) data
      wsProvider.awareness.setLocalState({
        userId: user.id,
        name: user.name || `User-${user.id.substring(0, 5)}`,
        color: userColorRef.current,
        cursor: null
      });
      
      // Update awareness data when other users change
      wsProvider.awareness.on('update', () => {
        const states = wsProvider.awareness.getStates();
        const presenceInfo = Array.from(states.entries())
          .map(([clientId, state]: [number, any]) => {
            if (!state) return null;
            return {
              clientId,
              userId: state.userId,
              name: state.name,
              color: state.color,
              cursor: state.cursor
            };
          })
          .filter(Boolean) as UserPresence[];
          
        setAwareness(presenceInfo);
      });
      
      // Sync status events
      dbProvider.on('synced', () => {
        // Set initial content if document is empty
        if (yText.toString() === '' && initialContent) {
          yText.insert(0, initialContent);
        }
        
        // Update initial state
        setContent(yText.toString());
        setTokens(Array.from(yTokens.values()));
        setIsInitialized(true);
        
        metricsCollector.increment('yjs.client.synced', {
          tenantId,
          documentId
        });
      });
      
      // Error handling
      wsProvider.on('connection-error', (error: Error) => {
        console.error('YJS connection error:', error);
        
        if (onSyncError) {
          onSyncError(error);
        }
        
        setError(error);
        
        metricsCollector.increment('yjs.client.connection_error', {
          tenantId,
          documentId,
          errorMessage: error.message
        });
      });
      
      // Listen for text changes
      yText.observe(() => {
        setContent(yText.toString());
      });
      
      // Listen for token changes
      yTokens.observe(() => {
        setTokens(Array.from(yTokens.values()));
      });
      
      // Track performance
      const duration = performance.now() - startTime;
      metricsCollector.recordValue('yjs.client.initialization', duration, {
        tenantId,
        documentId
      });
      
      // Cleanup on unmount
      return () => {
        if (wsProviderRef.current) {
          wsProviderRef.current.awareness.setLocalState(null);
          wsProviderRef.current.disconnect();
        }
        
        if (dbProviderRef.current) {
          dbProviderRef.current.destroy();
        }
        
        if (docRef.current) {
          docRef.current.destroy();
        }
        
        yTextRef.current = null;
        yTokensRef.current = null;
        wsProviderRef.current = null;
        dbProviderRef.current = null;
        docRef.current = null;
      };
    } catch (err) {
      console.error('Error initializing YJS collaboration:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      
      metricsCollector.increment('yjs.client.initialization_error', {
        tenantId,
        documentId,
        errorMessage: err instanceof Error ? err.message : String(err)
      });
    }
  }, [documentId, user?.id, user?.name, tenantId, initialContent, isInitialized, onSyncError]);
  
  // Update content in the Y.js document
  const updateContent = useCallback((newContent: string) => {
    if (!yTextRef.current || !docRef.current) return;
    
    docRef.current.transact(() => {
      yTextRef.current?.delete(0, yTextRef.current.length);
      yTextRef.current?.insert(0, newContent);
    });
  }, []);
  
  // Update tokens in the Y.js document
  const updateToken = useCallback((token: Token) => {
    if (!yTokensRef.current) return;
    
    yTokensRef.current.set(token.id, token);
  }, []);
  
  // Update token state
  const updateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    if (!yTokensRef.current) return false;
    
    const token = yTokensRef.current.get(tokenId);
    if (!token) return false;
    
    const updatedToken: Token = {
      ...token,
      metadata: {
        ...token.metadata,
        state: newState
      }
    };
    
    yTokensRef.current.set(tokenId, updatedToken);
    return true;
  }, []);
  
  // Update cursor position
  const updateCursor = useCallback((position: number, selection?: { start: number, end: number }) => {
    if (!wsProviderRef.current) return;
    
    const awareness = wsProviderRef.current.awareness;
    const currentState = awareness.getLocalState() || {};
    
    awareness.setLocalState({
      ...currentState,
      cursor: {
        position,
        selection
      }
    });
  }, []);
  
  // Remove cursor (when user stops editing)
  const removeCursor = useCallback(() => {
    if (!wsProviderRef.current) return;
    
    const awareness = wsProviderRef.current.awareness;
    const currentState = awareness.getLocalState() || {};
    
    awareness.setLocalState({
      ...currentState,
      cursor: null
    });
  }, []);
  
  return {
    isConnected,
    isInitialized,
    content,
    tokens,
    awareness,
    error,
    updateContent,
    updateToken,
    updateTokenState,
    updateCursor,
    removeCursor,
    userColor: userColorRef.current
  };
}