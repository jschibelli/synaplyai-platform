import { useState, useEffect, useCallback, useRef } from 'react';
import { TokenStateManager, TokenState, Token } from '../components/editor/TokenStateManager';

/**
 * Hook for using TokenStateManager in React components
 */
export function useTokenState(documentId: string, userId: string, tenantId: string, initialTokens?: Token[]) {
  const managerRef = useRef<TokenStateManager | null>(null);
  const [tokens, setTokens] = useState<Token[]>(initialTokens || []);
  const [conflicts, setConflicts] = useState<Token[]>([]);
  
  // Initialize the manager
  useEffect(() => {
    managerRef.current = new TokenStateManager({
      documentId,
      userId,
      tenantId,
      initialTokens
    });
    
    // Set initial state
    setTokens(managerRef.current.getAllTokens());
    setConflicts(managerRef.current.getConflictingTokens());
    
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
    
    return () => {
      if (managerRef.current) {
        managerRef.current.removeAllListeners();
      }
    };
  }, [documentId, userId, tenantId]);
  
  // Add a token
  const addToken = useCallback((token: Token) => {
    managerRef.current?.addToken(token);
  }, []);
  
  // Update token state
  const updateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    managerRef.current?.updateTokenState(tokenId, newState);
  }, []);
  
  // Resolve all conflicts
  const resolveAllConflicts = useCallback((strategy: 'accept-newest' | 'accept-oldest' | 'accept-local' | 'accept-remote') => {
    managerRef.current?.resolveAllConflicts(strategy);
  }, []);
  
  // Get style for a token
  const getTokenStyle = useCallback((tokenId: string) => {
    return managerRef.current?.getTokenStyle(tokenId) || {};
  }, []);
  
  // Export state
  const exportState = useCallback(() => {
    return managerRef.current?.exportState();
  }, []);
  
  // Import state
  const importState = useCallback((state: { tokens: Token[] }) => {
    managerRef.current?.importState(state);
  }, []);
  
  return {
    tokens,
    conflicts,
    hasConflicts: conflicts.length > 0,
    addToken,
    updateTokenState,
    resolveAllConflicts,
    getTokenStyle,
    exportState,
    importState
  };
}