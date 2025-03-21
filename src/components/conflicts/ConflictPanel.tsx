import React, { useState, useEffect } from 'react';
import { ConflictResolutionStrategy, ConflictType } from '../../conflicts/ConflictResolver';
import { Token } from './Token';
import { DiffView } from './DiffView';
import './ConflictPanel.css';
import { OperationalTransform, Operation } from '../../collaborative/OperationalTransform';

interface ConflictPanelProps {
  conflict: {
    id: string;
    type: ConflictType;
    localContent: string;
    remoteContent: string;
    tokens?: Array<{
      id: string;
      text: string;
      state: 'ACCEPTED' | 'REJECTED' | 'CONFLICTED';
    }>;
  };
  onResolve: (resolution: {
    conflictId: string;
    strategy: ConflictResolutionStrategy;
    mergedContent?: string;
  }) => void;
  relatedSuggestions?: Array<{
    id: string;
    content: string;
    state: 'CONFLICTED' | 'UPDATED';
  }>;
}

export const ConflictPanel: React.FC<ConflictPanelProps> = ({
  conflict,
  onResolve,
  relatedSuggestions = []
}) => {
  const [tokenState, setTokenState] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<string>('');
  
  useEffect(() => {
    // Initialize token states from conflict data
    const initialState: Record<string, string> = {};
    if (conflict.tokens) {
      conflict.tokens.forEach(token => {
        initialState[token.id] = token.state;
      });
      setTokenState(initialState);
    }
  }, [conflict]);

  const handleTokenClick = (tokenId: string) => {
    setTokenState(prev => {
      const currentState = prev[tokenId] || 'CONFLICTED';
      const newState = currentState === 'ACCEPTED' ? 'REJECTED' 
                      : currentState === 'REJECTED' ? 'CONFLICTED' : 'ACCEPTED';
      
      // Set accessibility status for screen readers
      setStatus(`Token marked as ${newState.toLowerCase()}`);
      
      return {
        ...prev,
        [tokenId]: newState
      };
    });
  };

  const handleMergeClick = () => {
    setStatus('Merging both versions');
    onResolve({
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.MERGE
    });
  };

  const handleKeepLocalClick = () => {
    setStatus('Keeping local version');
    onResolve({
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.LOCAL_FIRST
    });
  };

  const handleDiscardClick = () => {
    setStatus('Using remote version');
    onResolve({
      conflictId: conflict.id,
      strategy: ConflictResolutionStrategy.REMOTE_FIRST
    });
  };

  const handleSuggestionAction = (suggestionId: string, accept: boolean) => {
    // Handle related suggestion acceptance/rejection
    setStatus(`Suggestion ${accept ? 'accepted' : 'rejected'}`);
    console.log(`Suggestion ${suggestionId} ${accept ? 'accepted' : 'rejected'}`);
    // Implementation would dispatch an action to handle the suggestion
  };

  const getConflictDescription = (): string => {
    // Create a descriptive message about the conflict for screen readers
    return `Conflict detected between local content "${conflict.localContent.substring(0, 30)}${conflict.localContent.length > 30 ? '...' : ''}" 
            and remote content "${conflict.remoteContent.substring(0, 30)}${conflict.remoteContent.length > 30 ? '...' : ''}"`;
  };

  const applyTokenStateToContent = (conflict: Conflict, tokenState: Record<string, string>): string => {
    // If we have operations, use them for precise merging
    if (conflict.operations) {
      let baseContent = conflict.localContent;
      
      // Find tokens marked as accepted from remote content
      const acceptedRemoteTokens = conflict.tokens
        ?.filter(token => tokenState[token.id] === 'ACCEPTED' && token.id.startsWith('remote-'))
        .map(token => token.id);
        
      if (acceptedRemoteTokens?.length) {
        // For each accepted remote token, apply its operation
        // This is a simplified approach - a real implementation would be more complex
        // to handle operation dependencies
        const remoteOp = conflict.operations.remote;
        
        // Apply transformed remote operation
        const transformedOp = OperationalTransform.transform(remoteOp, conflict.operations.local);
        baseContent = OperationalTransform.apply(baseContent, transformedOp);
      }
      
      return baseContent;
    }
    
    // Fallback to simpler text-based approach
    // This is a simplified implementation - a real one would use the token positions
    let mergedContent = '';
    let localContent = conflict.localContent;
    let remoteContent = conflict.remoteContent;
    
    // Simple approach: use token state to decide which content to keep
    conflict.tokens?.forEach(token => {
      const state = tokenState[token.id] || token.state;
      
      if (state === 'ACCEPTED') {
        mergedContent += token.text;
      }
    });
    
    return mergedContent || conflict.localContent; // Fallback to local if merge fails
  };

  return (
    <div 
      className="conflict-panel" 
      role="region" 
      aria-label="Conflict Resolution Panel"
    >
      <div className="conflict-header">
        <div className="conflict-icon" aria-hidden="true">⚠️</div>
        <div className="conflict-title" id={`conflict-title-${conflict.id}`}>Conflict Detected</div>
      </div>

      {/* Accessibility status announcement */}
      <div className="sr-only" aria-live="polite" role="status">
        {status}
      </div>
      
      {/* Screen reader description of the conflict */}
      <div className="sr-only" id={`conflict-description-${conflict.id}`}>
        {getConflictDescription()}
      </div>

      <div 
        className="conflict-content" 
        aria-labelledby={`conflict-title-${conflict.id}`}
        aria-describedby={`conflict-description-${conflict.id}`}
      >
        <DiffView 
          original={conflict.localContent} 
          suggested={conflict.remoteContent}
          tokenStates={tokenState}
          onTokenClick={handleTokenClick}
        />
        
        <div className="conflict-actions">
          <button 
            onClick={handleMergeClick} 
            className="btn-merge"
            aria-label="Merge both versions"
          >
            Merge
          </button>
          <button 
            onClick={handleKeepLocalClick} 
            className="btn-keep-local"
            aria-label="Keep local version"
          >
            Keep Local
          </button>
          <button 
            onClick={handleDiscardClick} 
            className="btn-discard"
            aria-label="Use remote version"
          >
            Discard
          </button>
        </div>
      </div>

      {relatedSuggestions.length > 0 && (
        <div 
          className="related-suggestions"
          aria-labelledby="suggestions-title"
        >
          <div className="suggestions-header">
            <div className="suggestions-icon" aria-hidden="true">🔎</div>
            <div className="suggestions-title" id="suggestions-title">Related Suggestions</div>
          </div>
          
          <div className="suggestions-list">
            {relatedSuggestions.map(suggestion => (
              <div 
                key={suggestion.id} 
                className="suggestion-item"
                role="listitem"
              >
                <div className="suggestion-content">
                  <span>Suggested: </span>
                  <span className="suggested-text">{suggestion.content}</span>
                </div>
                <div className="suggestion-actions">
                  <button 
                    onClick={() => handleSuggestionAction(suggestion.id, true)}
                    className="btn-accept"
                    aria-label={`Accept suggestion: ${suggestion.content}`}
                  >
                    <span aria-hidden="true">✔️</span>
                  </button>
                  <button 
                    onClick={() => handleSuggestionAction(suggestion.id, false)}
                    className="btn-reject"
                    aria-label={`Reject suggestion: ${suggestion.content}`}
                  >
                    <span aria-hidden="true">❌</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};