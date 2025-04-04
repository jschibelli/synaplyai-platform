import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { v4 as uuidv4 } from 'uuid';
import { useYjsCollaboration } from '../../hooks/useYjsCollaboration';
import { DocumentVirtualizer } from '../../components/editor/DocumentVirtualizer';
import { ConflictPanel } from '../../components/editor/ConflictPanel';
import { TokenState } from '../../collaboration/tokens/TokenStateManager';
import { useUser } from '../../hooks/useUser';
import { metricsCollector } from '../../metrics/metrics-collector';

// Default sample content
const DEFAULT_CONTENT = `# Collaborative Editing with SynaplyAI

This is a real-time collaborative document editor with the following features:

- Multi-user real-time collaboration
- Token-level state management and conflict resolution
- User presence awareness with cursor tracking
- Offline support with automatic synchronization

## Try it out!

1. Open this page in multiple browser windows
2. Make changes in different parts of the document
3. Watch as changes sync in real-time
4. Try creating conflicts by editing the same text

Token states are color-coded:
- Green: Accepted changes
- Red: Rejected changes
- Yellow: Conflicts requiring resolution
`;

const CollaborativeEditorDemo: React.FC = () => {
  const router = useRouter();
  const { user } = useUser();
  const { docId } = router.query;
  
  // Document ID (from URL or generate new one)
  const documentId = typeof docId === 'string' ? docId : uuidv4();
  
  // State
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  
  // Initialize YJS collaboration
  const {
    isConnected,
    isInitialized,
    content,
    tokens,
    awareness,
    error,
    updateContent,
    updateToken,
    updateTokenState,
    updateCursor,
    removeCursor,
    userColor
  } = useYjsCollaboration({
    documentId,
    initialContent: DEFAULT_CONTENT,
    onSyncError: (err) => console.error('Sync error:', err)
  });
  
  // Check for conflicts
  const hasConflicts = tokens.some(token => token.metadata.state === TokenState.CONFLICT);
  
  // Show conflict panel when conflicts are detected
  useEffect(() => {
    if (hasConflicts) {
      setShowConflictPanel(true);
    }
  }, [hasConflicts]);
  
  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    updateContent(newContent);
    
    // Track content changes
    metricsCollector.increment('demo.content_changed', {
      documentId
    });
  }, [documentId, updateContent]);
  
  // Handle text insertion
  const handleInsertText = useCallback((text: string, position: number) => {
    const tokenId = uuidv4();
    
    // Create a new token
    updateToken({
      id: tokenId,
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.DEFAULT,
        userId: user?.id,
        timestamp: Date.now()
      }
    });
    
    return tokenId;
  }, [updateToken, user?.id]);
  
  // Handle token state updates
  const handleUpdateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    updateTokenState(tokenId, newState);
    
    metricsCollector.increment('demo.token_state_changed', {
      documentId,
      newState
    });
  }, [documentId, updateTokenState]);
  
  // Handle selection changes
  const handleSelectionChange = useCallback((selection: { start: number, end: number, text: string }) => {
    updateCursor(selection.start, { start: selection.start, end: selection.end });
  }, [updateCursor]);
  
  // Handle cursor position changes
  const handleCursorPositionChange = useCallback((position: number) => {
    updateCursor(position);
  }, [updateCursor]);
  
  // Handle conflict resolution
  const handleConflictsResolved = useCallback(() => {
    setShowConflictPanel(false);
  }, []);
  
  // Share document URL
  const handleShareClick = useCallback(() => {
    const url = `${window.location.origin}/demo/collaborative-editor?docId=${documentId}`;
    
    navigator.clipboard.writeText(url)
      .then(() => {
        alert('Document URL copied to clipboard! Share with collaborators.');
      })
      .catch(err => {
        console.error('Failed to copy URL:', err);
        alert(`Share this URL with collaborators: ${url}`);
      });
  }, [documentId]);
  
  // Set document ID in URL if not already there
  useEffect(() => {
    if (!docId && documentId) {
      router.replace(`/demo/collaborative-editor?docId=${documentId}`, undefined, { shallow: true });
    }
  }, [docId, documentId, router]);
  
  // Loading state
  if (!isInitialized || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500 mb-4"></div>
          <h2 className="text-xl font-semibold">Initializing collaborative editor...</h2>
        </div>
      </div>
    );
  }
  
  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <div className="text-center bg-red-50 p-6 rounded-lg shadow-lg max-w-md">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-red-700 mb-2">Error Initializing Editor</h2>
          <p className="text-red-600 mb-4">{error.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }
  
  return (
    <>
      <Head>
        <title>Collaborative Editor Demo | SynaplyAI</title>
      </Head>
      
      <div className="min-h-screen bg-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <header className="mb-8">
            <div className="flex justify-between items-center">
              <h1 className="text-3xl font-bold text-gray-800">Collaborative Editor Demo</h1>
              
              <div className="flex items-center space-x-4">
                {/* Connection status */}
                <div className={`flex items-center ${isConnected ? 'text-green-600' : 'text-yellow-600'}`}>
                  <div className={`h-3 w-3 rounded-full mr-2 ${isConnected ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <span>{isConnected ? 'Connected' : 'Reconnecting...'}</span>
                </div>
                
                {/* Share button */}
                <button 
                  onClick={handleShareClick}
                  className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
                >
                  Share Document
                </button>
              </div>
            </div>
            
            {/* Document information */}
            <div className="mt-2 text-sm text-gray-600">
              <p>Document ID: {documentId}</p>
              <p>Users connected: {awareness.length}</p>
            </div>
          </header>
          
          {/* Active users */}
          <div className="mb-6">
            <h2 className="font-semibold mb-2">Active Users:</h2>
            <div className="flex flex-wrap gap-2">
              {awareness.map(user => (
                <div 
                  key={user.clientId}
                  className="flex items-center bg-white px-3 py-1 rounded-full shadow-sm"
                  style={{ borderLeft: `4px solid ${user.color}` }}
                >
                  <span 
                    className="w-4 h-4 rounded-full mr-2" 
                    style={{ backgroundColor: user.color }}
                  ></span>
                  <span>{user.name}</span>
                </div>
              ))}
            </div>
          </div>
          
          {/* Conflict Panel */}
          {hasConflicts && showConflictPanel && (
            <div className="mb-6">
              <ConflictPanel 
                documentId={documentId}
                onResolveAll={handleConflictsResolved}
              />
            </div>
          )}
          
          {/* Conflict notification */}
          {hasConflicts && !showConflictPanel && (
            <div className="mb-6 bg-yellow-100 p-4 rounded flex justify-between items-center">
              <div className="flex items-center">
                <span className="text-yellow-800 font-semibold">⚠️ Conflicts detected</span>
                <span className="ml-2 text-yellow-700">There are editing conflicts that need to be resolved</span>
              </div>
              <button
                onClick={() => setShowConflictPanel(true)}
                className="bg-yellow-200 hover:bg-yellow-300 text-yellow-800 px-3 py-1 rounded"
              >
                Resolve Conflicts
              </button>
            </div>
          )}
          
          {/* Instructions */}
          <div className="mb-6 bg-blue-50 p-4 rounded">
            <h2 className="font-semibold text-blue-800 mb-2">Instructions:</h2>
            <ul className="list-disc pl-5 text-blue-700 space-y-1">
              <li>Open this URL in multiple browser windows to simulate collaboration</li>
              <li>Edit the document to see real-time updates across all clients</li>
              <li>Create conflicts by editing the same text in different windows</li>
              <li>Use the conflict panel to resolve editing conflicts</li>
              <li>Notice user cursors and presence indicators</li>
            </ul>
          </div>
          
          {/* Editor */}
          <div className="bg-white rounded-lg shadow-lg overflow-hidden">
            <DocumentVirtualizer
              documentId={documentId}
              content={content}
              tokens={tokens}
              viewportHeight={500}
              onContentChange={handleContentChange}
              onInsertText={handleInsertText}
              onUpdateTokenState={handleUpdateTokenState}
              onSelectionChange={handleSelectionChange}
              onCursorPositionChange={handleCursorPositionChange}
              userCursors={awareness}
            />
          </div>
          
          {/* Technical information */}
          <div className="mt-8 bg-gray-50 p-4 rounded text-sm text-gray-600">
            <h2 className="font-semibold mb-2">Technical Information:</h2>
            <p>This demo uses YJS for real-time collaborative editing with a custom TokenStateManager for conflict resolution.</p>
            <p>The document is synchronized across clients using WebSocket and persisted locally with IndexedDB.</p>
            <p>Color coding: Accepted changes (Green), Rejected changes (Red), Conflicts (Yellow).</p>
          </div>
        </div>
      </div>
    </>
  );
};

export default CollaborativeEditorDemo;