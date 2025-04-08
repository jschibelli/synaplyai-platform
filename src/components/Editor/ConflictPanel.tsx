import React, { useState } from 'react';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';
import { useTokenState } from '../../hooks/useTokenState';

interface ConflictPanelProps {
  documentId: string;
  onResolveAll?: () => void;
  className?: string;
}

export const ConflictPanel: React.FC<ConflictPanelProps> = ({
  documentId,
  onResolveAll,
  className = ''
}) => {
  const {
    conflicts,
    hasConflicts,
    updateTokenState,
    resolveAllConflicts,
    getTokenStyle
  } = useTokenState(documentId);
  
  const [selectedStrategy, setSelectedStrategy] = useState<'accept-newest' | 'accept-oldest' | 'accept-local' | 'accept-remote'>('accept-newest');
  
  if (!hasConflicts) {
    return null;
  }
  
  const handleAcceptToken = (tokenId: string) => {
    updateTokenState(tokenId, TokenState.ACCEPTED);
  };
  
  const handleRejectToken = (tokenId: string) => {
    updateTokenState(tokenId, TokenState.REJECTED);
  };
  
  const handleResolveAll = () => {
    resolveAllConflicts(selectedStrategy);
    if (onResolveAll) {
      onResolveAll();
    }
  };
  
  // Group conflicts by position for easier visualization
  const conflictsByPosition: Record<number, Token[]> = {};
  conflicts.forEach(conflict => {
    if (!conflictsByPosition[conflict.position]) {
      conflictsByPosition[conflict.position] = [];
    }
    conflictsByPosition[conflict.position].push(conflict);
  });
  
  return (
    <div className={`bg-white shadow-lg rounded-lg p-4 mb-4 ${className}`}>
      <h2 className="text-lg font-bold mb-2">Conflict Resolution</h2>
      <p className="text-sm text-gray-600 mb-4">
        {conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'} detected.
        Please resolve them before continuing.
      </p>
      
      <div className="space-y-4">
        {Object.entries(conflictsByPosition).map(([position, tokensAtPosition]) => (
          <div key={position} className="border rounded p-3">
            <h3 className="font-medium mb-2">Position {position}</h3>
            <div className="space-y-2">
              {tokensAtPosition.map(token => (
                <div key={token.id} className="flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="text-xs text-gray-500 mr-2">
                      {new Date(token.metadata.timestamp || 0).toLocaleTimeString()}
                    </span>
                    <span
                      className="py-1 px-2 rounded"
                      style={getTokenStyle(token.id)}
                    >
                      {token.text}
                    </span>
                  </div>
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
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t">
        <h3 className="font-medium mb-2">Resolve All Conflicts</h3>
        <div className="flex flex-col space-y-2">
          <div className="flex space-x-2">
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
              className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-sm"
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