import { useState, useEffect, useCallback, useRef } from 'react';
import { TokenStateManager, TokenState, Token } from '../collaboration/tokens/TokenStateManager';
import { useUser } from './useUser';
import { useTenantContext } from './useTenantContext';
import { triggerCommandEvent } from '../collaboration/commands/CommandEventBus';

/**
 * Hook for using TokenStateManager in React components
 */
export function useTokenState(documentId: string, initialTokens?: Token[]) {
  const { user } = useUser();
  const { tenantId } = useTenantContext();
  const [tokens, setTokens] = useState<Token[]>(initialTokens || []);
  const [conflicts, setConflicts] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const managerRef = useRef<TokenStateManager | null>(null);
  
  // Initialize the manager
  useEffect(() => {
    if (!user?.id || !tenantId) return;
    
    setIsLoading(true);
    
    managerRef.current = new TokenStateManager({
      documentId,
      userId: user.id,
      tenantId,
      initialTokens
    });
    
    // Set initial state
    setTokens(managerRef.current.getAllTokens());
    setConflicts(managerRef.current.getConflictingTokens());
    setIsLoading(false);
    
    // Listen for changes
    const handleTokenAdded = () => {
      if (managerRef.current) {
        setTokens(managerRef.current.getAllTokens());
      }
    };
    
    const handleTokenStateChanged = () => {
      if (managerRef.current) {
        setTokens(managerRef.current.getAllTokens());
        setConflicts(managerRef.current.getConflictingTokens());
      }
    };
    
    const handleConflictDetected = () => {
      if (managerRef.current) {
        setConflicts(managerRef.current.getConflictingTokens());
      }
    };
    
    managerRef.current.on('tokenAdded', handleTokenAdded);
    managerRef.current.on('tokenStateChanged', handleTokenStateChanged);
    managerRef.current.on('conflictDetected', handleConflictDetected);
    managerRef.current.on('stateImported', handleTokenStateChanged);
    managerRef.current.on('allConflictsResolved', handleTokenStateChanged);
    
    return () => {
      if (managerRef.current) {
        managerRef.current.dispose();
      }
    };
  }, [documentId, user?.id, tenantId, initialTokens]);
  
  // Add a token with command pattern integration
  const addToken = useCallback((token: Omit<Token, 'id'>): string => {
    if (!managerRef.current || !user?.id) return '';
    
    // Generate full token with ID
    const fullToken = {
      ...token,
      id: crypto.randomUUID()
    } as Token;
    
    // Add to token manager
    managerRef.current.addToken(fullToken);
    
    // Dispatch command event for event sourcing system
    triggerCommandEvent({
      type: 'ADD_TOKEN',
      documentId,
      userId: user.id,
      data: { token: fullToken }
    });
    
    return fullToken.id;
  }, [documentId, user?.id]);
  
  // Update token state with command pattern integration
  const updateTokenState = useCallback((tokenId: string, newState: TokenState): void => {
    if (!managerRef.current || !user?.id) return;
    
    managerRef.current.updateTokenState(tokenId, newState);
    
    // Dispatch command event for event sourcing system
    triggerCommandEvent({
      type: 'UPDATE_TOKEN_STATE',
      documentId,
      userId: user.id,
      data: { tokenId, newState }
    });
  }, [documentId, user?.id]);
  
  // Resolve all conflicts with command pattern integration
  const resolveAllConflicts = useCallback((strategy: 'accept-newest' | 'accept-oldest' | 'accept-local' | 'accept-remote'): void => {
    if (!managerRef.current || !user?.id) return;
    
    managerRef.current.resolveAllConflicts(strategy);
    
    // Dispatch command event for event sourcing system
    triggerCommandEvent({
      type: 'RESOLVE_ALL_CONFLICTS',
      documentId,
      userId: user.id,
      data: { strategy }
    });
  }, [documentId, user?.id]);
  
  // Get style for a token
  const getTokenStyle = useCallback((tokenId: string): Record<string, string> => {
    return managerRef.current?.getTokenStyle(tokenId) || {};
  }, []);
  
  // Export state for persistence
  const exportState = useCallback((): { tokens: Token[] } | undefined => {
    return managerRef.current?.exportState();
  }, []);
  
  // Import state from persistence
  const importState = useCallback((state: { tokens: Token[] }): void => {
    if (!managerRef.current || !user?.id) return;
    
    managerRef.current.importState(state);
    
    // Dispatch command event for event sourcing system
    triggerCommandEvent({
      type: 'IMPORT_TOKEN_STATE',
      documentId,
      userId: user.id,
      data: { state }
    });
  }, [documentId, user?.id]);
  
  return {
    tokens,
    conflicts,
    hasConflicts: conflicts.length > 0,
    isLoading,
    addToken,
    updateTokenState,
    resolveAllConflicts,
    getTokenStyle,
    exportState,
    importState
  };
}