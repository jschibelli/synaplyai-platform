import { useState, useEffect, useCallback, useRef } from 'react';
import { YjsProvider } from '../collaboration/yjs/YjsProvider';
import { Token, TokenState } from '../collaboration/tokens/TokenStateManager';
import { useUser } from './useUser';
import { useTenantContext } from './useTenantContext';
import { triggerCommandEvent } from '../collaboration/commands/CommandEventBus';

// Extract websocket URL from environment or use default
const YJS_WEBSOCKET_URL = process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL || 'ws://localhost:1234';

export interface YjsUserAwareness {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  cursor: { position: number, selection?: { start: number, end: number } } | null;
}

export interface UseYjsCollaborationOptions {
  initialContent?: string;
  onContentChanged?: (content: string) => void;
  onTokensChanged?: (tokens: Token[]) => void;
}

/**
 * Hook for real-time collaboration with YJS
 */
export function useYjsCollaboration(
  documentId: string, 
  options: UseYjsCollaborationOptions = {}
) {
  const { user } = useUser();
  const { tenantId } = useTenantContext();
  const providerRef = useRef<YjsProvider | null>(null);
  
  const [content, setContent] = useState<string>(options.initialContent || '');
  const [tokens, setTokens] = useState<Token[]>([]);
  const [users, setUsers] = useState<YjsUserAwareness[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);
  
  // Initialize YJS provider
  useEffect(() => {
    if (!user?.id || !tenantId || !documentId) return;
    
    try {
      setIsLoading(true);
      
      // Create YJS provider
      providerRef.current = new YjsProvider({
        documentId,
        userId: user.id,
        username: user.name || undefined,
        websocketUrl: YJS_WEBSOCKET_URL,
        tenantId
      });
      
      // Set initial content if provided
      const currentText = providerRef.current.getText();
      if (!currentText && options.initialContent) {
        providerRef.current.updateText(options.initialContent, 'init');
      } else if (currentText) {
        setContent(currentText);
      }
      
      // Set initial tokens
      setTokens(providerRef.current.getAllTokens());
      
      // Listen for text changes
      providerRef.current.on('textChanged', ({ delta, origin }) => {
        if (origin === 'local') return; // Skip local changes as they're already applied
        
        const newText = providerRef.current?.getText() || '';
        setContent(newText);
        
        if (options.onContentChanged) {
          options.onContentChanged(newText);
        }
      });
      
      // Listen for token changes
      providerRef.current.on('tokensChanged', ({ changes, origin }) => {
        const allTokens = providerRef.current?.getAllTokens() || [];
        setTokens(allTokens);
        
        if (options.onTokensChanged) {
          options.onTokensChanged(allTokens);
        }
      });
      
      // Listen for awareness changes
      providerRef.current.on('awarenessChanged', ({ users: newUsers }) => {
        setUsers(newUsers);
      });
      
      // Listen for connection state changes
      providerRef.current.on('connectionStateChanged', (connected: boolean) => {
        setIsConnected(connected);
      });
      
      // Listen for sync completed
      providerRef.current.on('synced', () => {
        setIsLoading(false);
      });
      
      // Set initial connection state
      setIsConnected(providerRef.current.isConnected());
      
      // Set loading state to false after a timeout if sync doesn't complete
      const timeoutId = setTimeout(() => {
        setIsLoading(false);
      }, 3000);
      
      return () => {
        clearTimeout(timeoutId);
        if (providerRef.current) {
          providerRef.current.destroy();
          providerRef.current = null;
        }
      };
    } catch (err) {
      console.error('Error initializing YJS collaboration:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsLoading(false);
    }
  }, [documentId, user?.id, user?.name, tenantId, options.initialContent, options.onContentChanged, options.onTokensChanged]);
  
  // Update content
  const updateContent = useCallback((newContent: string) => {
    if (!providerRef.current || !user?.id) return;
    
    providerRef.current.updateText(newContent, 'local');
    setContent(newContent);
    
    // Track command for event sourcing
    triggerCommandEvent({
      type: 'UPDATE_DOCUMENT_CONTENT',
      documentId,
      userId: user.id,
      data: { content: newContent }
    });
  }, [documentId, user?.id]);
  
  // Add a token
  const addToken = useCallback((token: Token) => {
    if (!providerRef.current || !user?.id) return;
    
    providerRef.current.setToken(token);
    setTokens(providerRef.current.getAllTokens());
    
    // Track command for event sourcing
    triggerCommandEvent({
      type: 'ADD_TOKEN',
      documentId,
      userId: user.id,
      data: { token }
    });
  }, [documentId, user?.id]);
  
  // Update token state
  const updateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    if (!providerRef.current || !user?.id) return;
    
    const success = providerRef.current.updateTokenState(tokenId, newState);
    if (success) {
      setTokens(providerRef.current.getAllTokens());
      
      // Track command for event sourcing
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
  
  // Undo/redo functionality
  const undo = useCallback(() => {
    if (!providerRef.current) return;
    providerRef.current.undo();
  }, []);
  
  const redo = useCallback(() => {
    if (!providerRef.current) return;
    providerRef.current.redo();
  }, []);
  
  return {
    content,
    tokens,
    users,
    isConnected,
    isLoading,
    error,
    updateContent,
    addToken,
    updateTokenState,
    updateCursor,
    undo,
    redo
  };
}