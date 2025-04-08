import { useState, useEffect, useCallback, useRef } from 'react';
import { YjsDocumentProvider } from '../collaboration/yjs/YjsDocumentProvider';
import { Token, TokenState } from '../collaboration/tokens/TokenStateManager';
import { useUser } from './useUser';
import { useTenantContext } from './useTenantContext';
import { triggerCommandEvent } from '../collaboration/commands/CommandEventBus';

// Default websocket URL, should come from environment variables
const DEFAULT_WEBSOCKET_URL = process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL || 'ws://localhost:1234';

export interface YjsUserAwareness {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  cursor: { position: number, selection?: { start: number, end: number } } | null;
}

/**
 * Hook for integrating YJS collaborative editing with React components
 */
export function useYjsDocument(documentId: string, initialContent: string = '') {
  const { user } = useUser();
  const { tenantId } = useTenantContext();
  const [content, setContent] = useState<string>(initialContent);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [users, setUsers] = useState<YjsUserAwareness[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  const providerRef = useRef<YjsDocumentProvider | null>(null);
  
  // Initialize the YJS provider
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    
    try {
      setIsLoading(true);
      
      // Create a new YJS provider
      providerRef.current = new YjsDocumentProvider({
        documentId,
        userId: user.id,
        username: user.name,
        websocketUrl: DEFAULT_WEBSOCKET_URL,
        tenantId
      });
      
      // Set initial content if document is empty
      const currentText = providerRef.current.getText();
      if (!currentText && initialContent) {
        providerRef.current.updateText(initialContent, 'init');
      } else if (currentText) {
        setContent(currentText);
      }
      
      // Set initial tokens
      setTokens(providerRef.current.getAllTokens());
      
      // Listen for text changes
      providerRef.current.on('textChanged', ({ delta, origin }) => {
        if (origin === 'local') return; // Skip local changes as they're already applied
        setContent(providerRef.current?.getText() || '');
      });
      
      // Listen for token changes
      providerRef.current.on('tokensChanged', ({ changes, origin }) => {
        if (origin === 'local') return; // Skip local changes as they're already applied
        setTokens(providerRef.current?.getAllTokens() || []);
      });
      
      // Listen for connection state changes
      providerRef.current.on('connectionStateChanged', (connected: boolean) => {
        setIsConnected(connected);
      });
      
      // Listen for awareness changes
      providerRef.current.on('awarenessChanged', ({ users: newUsers }) => {
        setUsers(newUsers);
      });
      
      // Listen for sync completed
      providerRef.current.on('synced', () => {
        setIsLoading(false);
      });
      
      // Set initial connection state
      setIsConnected(providerRef.current.isWebsocketConnected());
      
      // Set loading state to false if not already
      setTimeout(() => {
        setIsLoading(false);
      }, 2000); // Timeout in case 'synced' isn't fired
    } catch (err) {
      console.error('Error initializing YJS document:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }
    
    // Clean up
    return () => {
      if (providerRef.current) {
        providerRef.current.destroy();
        providerRef.current = null;
      }
    };
  }, [documentId, user?.id, user?.name, tenantId, initialContent]);
  
  // Update the text content
  const updateContent = useCallback((newContent: string) => {
    if (!providerRef.current) return;
    
    providerRef.current.updateText(newContent, 'local');
    setContent(newContent);
    
    // Dispatch command event for event sourcing
    if (user?.id) {
      triggerCommandEvent({
        type: 'UPDATE_DOCUMENT_CONTENT',
        documentId,
        userId: user.id,
        data: { content: newContent }
      });
    }
  }, [documentId, user?.id]);
  
  // Update a token
  const updateToken = useCallback((token: Token) => {
    if (!providerRef.current || !user?.id) return;
    
    providerRef.current.setToken(token);
    setTokens(providerRef.current.getAllTokens());
    
    // Dispatch command event for event sourcing
    triggerCommandEvent({
      type: 'UPDATE_TOKEN',
      documentId,
      userId: user.id,
      data: { token }
    });
  }, [documentId, user?.id]);
  
  // Update a token's state
  const updateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    if (!providerRef.current || !user?.id) return;
    
    const success = providerRef.current.updateTokenState(tokenId, newState);
    if (success) {
      setTokens(providerRef.current.getAllTokens());
      
      // Dispatch command event for event sourcing
      triggerCommandEvent({
        type: 'UPDATE_TOKEN_STATE',
        documentId,
        userId: user.id,
        data: { tokenId, newState }
      });
    }
  }, [documentId, user?.id]);
  
  // Update cursor position
  const updateCursor = useCallback((position: number | null, selection?: { start: number, end: number }) => {
    if (!providerRef.current) return;
    
    providerRef.current.updateCursor(position, selection);
  }, []);
  
  // Get the raw YDoc for advanced operations
  const getYDoc = useCallback(() => {
    if (!providerRef.current) return null;
    return providerRef.current.getYDoc();
  }, []);
  
  return {
    content,
    tokens,
    isConnected,
    users,
    isLoading,
    error,
    updateContent,
    updateToken,
    updateTokenState,
    updateCursor,
    getYDoc
  };
}