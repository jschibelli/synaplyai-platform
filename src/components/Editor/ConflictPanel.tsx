import React from 'react';
import { Token, TokenState } from './TokenStateManager';
import { useTokenState } from '../../hooks/useTokenState';

interface ConflictPanelProps {
  documentId: string;
  userId: string;
  tenantId: string;
  onResolveAll?: () => void;
}

export const ConflictPanel: React.FC<ConflictPanelProps> = ({
  documentId,
  userId,
  tenantId,
  onResolveAll
}) => {
  const {
    conflicts,
    hasConflicts,
    updateTokenState,
    resolveAllConflicts,
    getTokenStyle
  } = useTokenState(documentId, userId, tenantId);
  
  if (!hasConflicts) {
    return null;
  }
  
  const handleAcceptToken = (tokenId: string) => {
    updateTokenState(tokenId, TokenState.ACCEPTED);
  };
  
  const handleRejectToken = (tokenId: string) => {
    updateTokenState(tokenId, TokenState.REJECTED);
  };
  
  const handleResolveAll = (strategy: 'accept-newest' | 'accept-oldest' | 'accept-local' | 'accept-remote') => {
    resolveAllConflicts(strategy);
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
    <div className="bg-white shadow-lg rounded-lg p-4 mb-4">
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
                  <span
                    className="py-1 px-2 rounded"
                    style={getTokenStyle(token.id)}
                  >
                    {token.text}
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
              ))}
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-4 border-t">
        <h3 className="font-medium mb-2">Resolve All Conflicts</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => handleResolveAll('accept-newest')}
            className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-sm"
          >
            Accept Newest
          </button>
          <button
            onClick={() => handleResolveAll('accept-oldest')}
            className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-sm"
          >
            Accept Oldest
          </button>
          <button
            onClick={() => handleResolveAll('accept-local')}
            className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-sm"
          >
            Accept Mine
          </button>
          <button
            onClick={() => handleResolveAll('accept-remote')}
            className="bg-blue-500 hover:bg-blue-600 text-white py-1 px-2 rounded text-sm"
          >
            Accept Others
          </button>
        </div>
      </div>
    </div>
  );
};