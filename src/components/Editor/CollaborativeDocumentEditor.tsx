import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { useYjsDocument, YjsUserAwareness } from '../../hooks/useYjsDocument';
import { DocumentVirtualizer } from './DocumentVirtualizer';
import { ConflictPanel } from './ConflictPanel';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';
import { useDocument } from '../../hooks/useDocument';

interface CollaborativeDocumentEditorProps {
  documentId: string;
  height?: number;
  readOnly?: boolean;
  className?: string;
}

export const CollaborativeDocumentEditor: React.FC<CollaborativeDocumentEditorProps> = ({
  documentId,
  height = 500,
  readOnly = false,
  className = ''
}) => {
  const { document, isLoading: isDocumentLoading } = useDocument(documentId);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  const [selection, setSelection] = useState<{ start: number, end: number, text: string } | null>(null);
  
  // Initialize YJS with document content
  const {
    content,
    tokens,
    isConnected,
    users,
    isLoading: isYjsLoading,
    error,
    updateContent,
    updateToken,
    updateTokenState,
    updateCursor
  } = useYjsDocument(documentId, document?.content || '');
  
  // Compute conflicts from tokens
  const conflicts = useMemo(() => 
    tokens.filter(token => token.metadata.state === TokenState.CONFLICT),
    [tokens]
  );
  
  const hasConflicts = conflicts.length > 0;
  
  // Update conflict panel visibility when conflicts change
  useEffect(() => {
    if (hasConflicts) {
      setShowConflictPanel(true);
    }
  }, [hasConflicts]);
  
  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    if (readOnly) return;
    updateContent(newContent);
  }, [readOnly, updateContent]);
  
  // Handle selection changes
  const handleSelectionChange = useCallback((sel: { start: number, end: number, text: string }) => {
    setSelection(sel);
    updateCursor(sel.start, { start: sel.start, end: sel.end });
  }, [updateCursor]);
  
  // Handle cursor position changes without selection
  const handleCursorPositionChange = useCallback((position: number) => {
    updateCursor(position);
  }, [updateCursor]);
  
  // Handle text insertion (creating a new token)
  const handleInsertText = useCallback((text: string, position: number) => {
    if (readOnly) return '';
    
    // Create a new token
    const token: Token = {
      id: crypto.randomUUID(),
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.DEFAULT,
        timestamp: Date.now()
      }
    };
    
    // Update the token in YJS
    updateToken(token);
    
    return token.id;
  }, [readOnly, updateToken]);
  
  // Handle token state changes
  const handleTokenStateChange = useCallback((tokenId: string, newState: TokenState) => {
    updateTokenState(tokenId, newState);
  }, [updateTokenState]);
  
  // Handle conflict resolution
  const handleConflictResolved = useCallback(() => {
    if (conflicts.length === 0) {
      setShowConflictPanel(false);
    }
  }, [conflicts.length]);
  
  // Extract other users' cursor positions for rendering
  const otherUserCursors = useMemo(() => 
    users.filter(user => user.userId !== document?.ownerId),
    [users, document?.ownerId]
  );
  
  // Loading state
  const isLoading = isDocumentLoading || isYjsLoading;
  
  if (isLoading) {
    return <div className="p-4 bg-gray-100 rounded">Loading collaborative document...</div>;
  }
  
  if (error) {
    return <div className="p-4 bg-red-100 text-red-800 rounded">Error: {error.message}</div>;
  }
  
  if (!document) {
    return <div className="p-4 bg-red-100 text-red-800 rounded">Document not found</div>;
  }
  
  return (
    <div className={`collaborative-document-editor ${className}`}>
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
            className="px-4 py-2 bg-yellow-200 hover:bg-yellow-300 text-yellow-800 rounded"
          >
            {showConflictPanel ? 'Hide Conflict Panel' : 'Show Conflict Panel'}
          </button>
        </div>
      )}
      
      {/* Conflict panel */}
      {showConflictPanel && hasConflicts && (
        <ConflictPanel
          documentId={documentId}
          onResolveAll={handleConflictResolved}
          className="mb-4"
        />
      )}
      
      {/* Connected users avatars */}
      <div className="users-avatars flex -space-x-2 mb-2">
        {users.map(user => (
          <div 
            key={user.clientId} 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs border-2 border-white"
            style={{ backgroundColor: user.color }}
            title={user.name}
          >
            {user.name.substring(0, 2).toUpperCase()}
          </div>
        ))}
      </div>
      
      {/* Document virtualizer with tokens */}
      <DocumentVirtualizer
        documentId={documentId}
        content={content}
        tokens={tokens}
        viewportHeight={height}
        onSelectionChange={handleSelectionChange}
        onCursorPositionChange={handleCursorPositionChange}
        onContentChange={handleContentChange}
        onInsertText={handleInsertText}
        onUpdateTokenState={handleTokenStateChange}
        userCursors={otherUserCursors}
        readOnly={readOnly}
      />
      
      {/* Selection info */}
      {selection && (
        <div className="mt-2 p-2 text-sm text-gray-600 border-t">
          Selection: {selection.start}-{selection.end} ({selection.text ? selection.text.length : 0} chars)
        </div>
      )}
    </div>
  );
};