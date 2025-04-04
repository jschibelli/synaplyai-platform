import React, { useState, useEffect } from 'react';
import { useCollaborativeDocument } from '../../hooks/useCollaborativeDocument';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';

interface ConflictPanelProps {
  documentId: string;
  onResolveAll?: () => void;
  className?: string;
}

/**
 * A panel for resolving conflicts in collaborative editing
 */
export const ConflictPanel: React.FC<ConflictPanelProps> = ({
  documentId,
  onResolveAll,
  className = ''
}) => {
  const {
    conflicts,
    tokens,
    hasConflicts,
    updateTokenState,
    resolveAllConflicts,
    getTokenStyle
  } = useCollaborativeDocument(documentId);
  
  const [selectedStrategy, setSelectedStrategy] = useState<'accept-newest' | 'accept-oldest' | 'accept-local' | 'accept-remote'>('accept-newest');
  const [expandedConflicts, setExpandedConflicts] = useState<Set<string>>(new Set());
  
  // Automatically expand conflicts when they're detected
  useEffect(() => {
    if (conflicts.length > 0) {
      setExpandedConflicts(new Set(conflicts.map(token => token.position.toString())));
    }
  }, [conflicts.length]);
  
  if (!hasConflicts) {
    return null;
  }
  
  // Group conflicts by position for easier visualization
  const conflictsByPosition: Record<number, Token[]> = {};
  conflicts.forEach(conflict => {
    if (!conflictsByPosition[conflict.position]) {
      conflictsByPosition[conflict.position] = [];
    }
    conflictsByPosition[conflict.position].push(conflict);
  });
  
  // Get user information for a token
  const getTokenUserInfo = (token: Token) => {
    const timestamp = token.metadata.timestamp 
      ? new Date(token.metadata.timestamp).toLocaleString()
      : 'Unknown time';
      
    return `${token.metadata.userId?.substring(0, 8) || 'Unknown user'} at ${timestamp}`;
  };
  
  // Toggle expanded state for a conflict group
  const toggleExpanded = (position: number) => {
    const newExpanded = new Set(expandedConflicts);
    if (newExpanded.has(position.toString())) {
      newExpanded.delete(position.toString());
    } else {
      newExpanded.add(position.toString());
    }
    setExpandedConflicts(newExpanded);
  };
  
  // Handle accept/reject actions
  const handleAcceptToken = (tokenId: string) => {
    updateTokenState(tokenId, TokenState.ACCEPTED);
  };
  
  const handleRejectToken = (tokenId: string) => {
    updateTokenState(tokenId, TokenState.REJECTED);
  };
  
  // Handle resolving all conflicts
  const handleResolveAll = () => {
    resolveAllConflicts(selectedStrategy);
    if (onResolveAll) {
      onResolveAll();
    }
  };
  
  return (
    <div className={`bg-white shadow-lg rounded-lg p-4 ${className}`}>
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Conflict Resolution</h2>
        <div className="text-sm bg-yellow-100 rounded-full px-3 py-1 text-yellow-800">
          {conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'}
        </div>
      </div>
      
      <p className="text-sm text-gray-600 mb-4">
        Please resolve conflicts to ensure document consistency across all collaborators.
      </p>
      
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {Object.entries(conflictsByPosition).map(([position, tokensAtPosition]) => (
          <div key={position} className="border rounded-lg overflow-hidden">
            <div 
              className="bg-gray-100 p-3 flex justify-between items-center cursor-pointer"
              onClick={() => toggleExpanded(parseInt(position))}
            >
              <h3 className="font-medium">
                Position {position} - {tokensAtPosition.length} conflicting changes
              </h3>
              <span>
                {expandedConflicts.has(position) ? '▼' : '▶'}
              </span>
            </div>
            
            {expandedConflicts.has(position) && (
              <div className="p-3 space-y-3">
                {tokensAtPosition.map(token => (
                  <div key={token.id} className="flex flex-col border rounded p-2">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs text-gray-500">
                        By {getTokenUserInfo(token)}
                      </span>
                      <div className="space-x-2">
                        <button
                          onClick={() => handleAcceptToken(token.id)}
                          className="bg-green-500 hover:bg-green-600 text-white py-1 px-2 rounded text-sm"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleRejectToken(token.id)}
                          className="bg-red-500 hover:bg-red-600 text-white py-1 px-2 rounded text-sm"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex items-start">
                      <div 
                        className="py-1 px-2 rounded w-full font-mono text-sm"
                        style={getTokenStyle(token.id)}
                      >
                        {token.text}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Context viewer - show surrounding content */}
                <div className="mt-2 border-t pt-2">
                  <div className="text-xs text-gray-500 mb-1">Context</div>
                  <div className="bg-gray-50 p-2 rounded font-mono text-sm break-all">
                    {/* This is simplified - you'd need to extract actual context */}
                    ...{tokens.find(t => t.position === parseInt(position))?.text || ''}...
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t">
        <h3 className="font-medium mb-2">Resolve All Conflicts</h3>
        <div className="flex flex-col space-y-2">
          <div className="flex flex-wrap gap-2">
            <select 
              className="border rounded px-2 py-1 text-sm"
              value={selectedStrategy}
              onChange={(e) => setSelectedStrategy(e.target.value as any)}
            >
              <option value="accept-newest">Accept Newest</option>
              <option value="accept-oldest">Accept Oldest</option>
              <option value="accept-local">Accept Mine</option>
              <option value="accept-remote">Accept Others</option>
            </select>
            <button
              onClick={handleResolveAll}
              className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-3 rounded text-sm"
            >
              Apply to All
            </button>
          </div>
          <p className="text-xs text-gray-500">
            {selectedStrategy === 'accept-newest' && 'Accepts the most recent changes and rejects older ones.'}
            {selectedStrategy === 'accept-oldest' && 'Accepts the original content and rejects newer changes.'}
            {selectedStrategy === 'accept-local' && 'Accepts your changes and rejects changes from others.'}
            {selectedStrategy === 'accept-remote' && 'Accepts changes from others and rejects your changes.'}
          </p>
        </div>
      </div>
    </div>
  );
};