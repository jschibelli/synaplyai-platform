import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useYjsCollaboration, YjsUserAwareness } from '../../hooks/useYjsCollaboration';
import { useTokenState } from '../../hooks/useTokenState';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';
import { DocumentVirtualizer } from './DocumentVirtualizer';
import { ConflictPanel } from './ConflictPanel';

export interface CollaborativeEditorProps {
  documentId: string;
  initialContent?: string;
  readOnly?: boolean;
  height?: number;
  className?: string;
  onContentChange?: (content: string) => void;
}

/**
 * A collaborative rich text editor that integrates YJS with token-level conflict resolution
 */
export const CollaborativeEditor: React.FC<CollaborativeEditorProps> = ({
  documentId,
  initialContent = '',
  readOnly = false,
  height = 500,
  className = '',
  onContentChange
}) => {
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [selection, setSelection] = useState<{ start: number, end: number, text: string } | null>(null);
  
  // Initialize YJS collaboration
  const {
    content,
    tokens: yjsTokens,
    users,
    isConnected,
    isLoading: isYjsLoading,
    error,
    updateContent,
    addToken,
    updateTokenState: updateYjsTokenState,
    updateCursor
  } = useYjsCollaboration(documentId, {
    initialContent,
    onContentChanged: onContentChange
  });
  
  // Initialize token state manager for conflict handling
  const {
    tokens: localTokens,
    conflicts,
    hasConflicts,
    getTokenStyle,
    isLoading: isTokenStateLoading
  } = useTokenState(documentId, yjsTokens);
  
  // Sync yjsTokens to TokenStateManager
  useEffect(() => {
    // This effect synchronizes token state from YJS to local token state manager
    // In a full implementation, this would handle merging strategies
    // For now, we just ensure that any changes from YJS are reflected
  }, [yjsTokens]);
  
  // Update conflict panel visibility when conflicts change
  useEffect(() => {
    if (hasConflicts) {
      setShowConflictPanel(true);
    }
  }, [hasConflicts]);
  
  // Filter out users to only show others (not current user)
  const otherUsers = useMemo(() => 
    users.filter(user => user.userId !== documentId)
  , [users, documentId]);
  
  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    if (readOnly) return;
    updateContent(newContent);
  }, [readOnly, updateContent]);
  
  // Handle text selection
  const handleSelectionChange = useCallback((sel: { start: number, end: number, text: string }) => {
    setSelection(sel);
    updateCursor(sel.start, { start: sel.start, end: sel.end });
  }, [updateCursor]);
  
  // Handle text insertion with token creation
  const handleInsertText = useCallback((text: string, position: number): string => {
    if (readOnly) return '';
    
    // Create a new token
    const tokenId = crypto.randomUUID();
    
    // Add to YJS
    addToken({
      id: tokenId,
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.DEFAULT,
        timestamp: Date.now()
      }
    });
    
    return tokenId;
  }, [readOnly, addToken]);
  
  // Handle token state changes (accept/reject)
  const handleUpdateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    updateYjsTokenState(tokenId, newState);
  }, [updateYjsTokenState]);
  
  // Handle conflict resolution completion
  const handleConflictResolved = useCallback(() => {
    if (conflicts.length === 0) {
      setShowConflictPanel(false);
    }
  }, [conflicts.length]);
  
  // Loading state
  const isLoading = isYjsLoading || isTokenStateLoading;
  
  if (isLoading) {
    return <div className="p-4 bg-gray-100 rounded animate-pulse">Loading collaborative document...</div>;
  }
  
  if (error) {
    return <div className="p-4 bg-red-100 text-red-800 rounded">Error: {error.message}</div>;
  }
  
  return (
    <div className={`collaborative-editor ${className}`}>
      {/* Connection status indicator */}
      <div className={`connection-status ${isConnected ? 'bg-green-100' : 'bg-yellow-100'} p-2 mb-2 rounded flex items-center`}>
        <div className={`status-indicator w-3 h-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
        <span className="text-sm">
          {isConnected ? 'Connected' : 'Reconnecting...'}
        </span>
        <span className="ml-auto text-sm">
          {users.length} {users.length === 1 ? 'user' : 'users'} active
        </span>
      </div>
      
      {/* Conflict notification and toggle */}
      {hasConflicts && (
        <div className="flex justify-between items-center bg-yellow-100 p-3 rounded mb-4">
          <div className="text-yellow-800">
            <span className="font-bold">⚠️ Conflicts detected</span>
            <span className="ml-2">{conflicts.length} {conflicts.length === 1 ? 'conflict' : 'conflicts'} need resolution</span>
          </div>
          <button
            onClick={() => setShowConflictPanel(!showConflictPanel)}
            className="px-4 py-2 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded transition"
          >
            {showConflictPanel ? 'Hide Conflict Panel' : 'Show Conflict Panel'}
          </button>
        </div>
      )}
      
      {/* Conflict resolution panel */}
      {showConflictPanel && hasConflicts && (
        <ConflictPanel
          documentId={documentId}
          onResolveAll={handleConflictResolved}
          className="mb-4 shadow-lg"
        />
      )}
      
      {/* Connected users */}
      {users.length > 0 && (
        <div className="users-avatars flex -space-x-2 mb-2">
          {users.map(user => (
            <div 
              key={`user-${user.clientId}`} 
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs border-2 border-white"
              style={{ backgroundColor: user.color }}
              title={user.name}
            >
              {user.name.substring(0, 2).toUpperCase()}
            </div>
          ))}
        </div>
      )}
      
      {/* Document editor */}
      <DocumentVirtualizer
        documentId={documentId}
        content={content}
        tokens={localTokens}
        viewportHeight={height}
        onSelectionChange={handleSelectionChange}
        onContentChange={handleContentChange}
        onInsertText={handleInsertText}
        onUpdateTokenState={handleUpdateTokenState}
        getTokenStyle={getTokenStyle}
        userCursors={otherUsers}
        readOnly={readOnly}
      />
      
      {/* Selection info */}
      {selection && (
        <div className="mt-2 p-2 text-sm text-gray-600 border-t">
          Selection: {selection.start}-{selection.end} ({selection.text.length} chars)
        </div>
      )}
    </div>
  );
}