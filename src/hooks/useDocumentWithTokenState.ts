import { useCallback, useState, useEffect } from 'react';
import { useTokenState } from './useTokenState';
import { Token, TokenState } from '../collaboration/tokens/TokenStateManager';
import { useDocument } from './useDocument';

/**
 * Integrates the document editor with token state management
 */
export function useDocumentWithTokenState(documentId: string) {
  const { document, isLoading: isDocumentLoading, updateDocument } = useDocument(documentId);
  const { 
    tokens, 
    conflicts, 
    hasConflicts,
    addToken, 
    updateTokenState, 
    resolveAllConflicts,
    getTokenStyle,
    isLoading: isTokenStateLoading
  } = useTokenState(documentId);
  
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  
  // Handle text insertion
  const handleInsertText = useCallback((text: string, position: number) => {
    // Add token to token state manager
    const tokenId = addToken({
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.DEFAULT,
        timestamp: Date.now()
      }
    });
    
    // Update the document content
    if (document?.content) {
      const newContent = 
        document.content.substring(0, position) + 
        text + 
        document.content.substring(position);
      
      updateDocument({
        ...document,
        content: newContent
      });
    }
    
    return tokenId;
  }, [addToken, document, updateDocument]);
  
  // Handle AI-generated text insertion
  const handleInsertAIGeneratedText = useCallback((text: string, position: number, sourceId: string) => {
    // Add token to token state manager with AI_GENERATED state
    const tokenId = addToken({
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.AI_GENERATED,
        timestamp: Date.now(),
        sourceId
      }
    });
    
    // Update the document content
    if (document?.content) {
      const newContent = 
        document.content.substring(0, position) + 
        text + 
        document.content.substring(position);
      
      updateDocument({
        ...document,
        content: newContent
      });
    }
    
    return tokenId;
  }, [addToken, document, updateDocument]);
  
  // Render the document with token state styling
  const renderDocumentWithTokenStates = useCallback(() => {
    if (!document?.content || tokens.length === 0) {
      return <div>{document?.content || ''}</div>;
    }
    
    // Sort tokens by position
    const sortedTokens = [...tokens].sort((a, b) => a.position - b.position);
    
    // Create document segments with token styling
    const segments: JSX.Element[] = [];
    let lastPosition = 0;
    
    sortedTokens.forEach((token, index) => {
      // Add text before this token if there's a gap
      if (token.position > lastPosition) {
        segments.push(
          <span key={`text-${index}`}>
            {document.content.substring(lastPosition, token.position)}
          </span>
        );
      }
      
      // Add the token with styling
      segments.push(
        <span 
          key={token.id}
          style={getTokenStyle(token.id)}
          onClick={() => setSelectedTokenId(token.id)}
          className={`cursor-pointer ${selectedTokenId === token.id ? 'ring-2 ring-blue-500' : ''}`}
        >
          {token.text}
        </span>
      );
      
      lastPosition = token.position + token.length;
    });
    
    // Add remaining text after last token
    if (lastPosition < document.content.length) {
      segments.push(
        <span key="text-end">
          {document.content.substring(lastPosition)}
        </span>
      );
    }
    
    return <div>{segments}</div>;
  }, [document, tokens, getTokenStyle, selectedTokenId]);
  
  const isLoading = isDocumentLoading || isTokenStateLoading;
  
  return {
    document,
    tokens,
    conflicts,
    hasConflicts,
    selectedTokenId,
    setSelectedTokenId,
    isLoading,
    handleInsertText,
    handleInsertAIGeneratedText,
    updateTokenState,
    resolveAllConflicts,
    renderDocumentWithTokenStates
  };
}