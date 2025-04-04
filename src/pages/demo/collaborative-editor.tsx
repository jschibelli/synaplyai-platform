import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { v4 as uuidv4 } from 'uuid';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';
import { TokenStateManager, TokenState, Token } from '../../collaboration/tokens/TokenStateManager';
import { DocumentVirtualizer } from '../../components/editor/DocumentVirtualizer';
import { ConflictPanel } from '../../components/editor/ConflictPanel';
import { metricsCollector } from '../../metrics/metrics-collector';
import { getTenantContext } from '../../lib/tenant-context';
import { useUser } from '../../hooks/useUser';

// Default sample content for new documents
const DEFAULT_CONTENT = `# Collaborative Editing Demo

This is a demonstration of real-time collaborative editing using YJS and the SynaplyAI platform.

## Features:
- Real-time collaboration with multiple users
- Token-level state management
- Conflict resolution
- Presence awareness with cursor tracking

Try editing this document with multiple browser windows to see the collaboration in action.
`;

// Server URL for YJS WebSocket connection
const YJS_WEBSOCKET_URL = process.env.NEXT_PUBLIC_YJS_WEBSOCKET_URL || 'ws://localhost:1234';

// Generate random user colors for the demo
const USER_COLORS = [
  '#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5',
  '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50',
  '#8bc34a', '#cddc39', '#ffc107', '#ff9800', '#ff5722'
];

// User presence interface
interface UserPresence {
  clientId: number;
  userId: string;
  name: string;
  color: string;
  cursor: {
    position: number;
    selection?: { start: number, end: number };
  } | null;
}

const CollaborativeEditorDemo: React.FC = () => {
  const router = useRouter();
  const { docId } = router.query;
  const { user } = useUser();
  const tenantContext = getTenantContext();
  
  // Document ID (from URL or generate new one)
  const documentId = typeof docId === 'string' ? docId : uuidv4();
  
  // State
  const [doc, setDoc] = useState<Y.Doc | null>(null);
  const [wsProvider, setWsProvider] = useState<WebsocketProvider | null>(null);
  const [dbProvider, setDbProvider] = useState<IndexeddbPersistence | null>(null);
  const [tokenManager, setTokenManager] = useState<TokenStateManager | null>(null);
  const [content, setContent] = useState<string>(DEFAULT_CONTENT);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [hasConflicts, setHasConflicts] = useState<boolean>(false);
  const [showConflictPanel, setShowConflictPanel] = useState<boolean>(false);
  const [userPresence, setUserPresence] = useState<UserPresence[]>([]);
  const [isInitialized, setIsInitialized] = useState<boolean>(false);
  const [userColor, setUserColor] = useState<string>('');
  
  // Initialize YJS and TokenStateManager
  useEffect(() => {
    if (!user?.id || isInitialized) return;
    
    const startTime = performance.now();
    
    try {
      // Create a new Y.Doc instance
      const yDoc = new Y.Doc();
      
      // Set up shared data types
      const yText = yDoc.getText('content');
      const yTokens = yDoc.getMap('tokens');
      
      // If the text is empty, initialize it with default content
      if (yText.toString() === '') {
        yText.insert(0, DEFAULT_CONTENT);
      }
      
      // Create WebSocket provider for real-time collaboration
      const websocketProvider = new WebsocketProvider(
        YJS_WEBSOCKET_URL,
        `${tenantContext?.tenantId || 'default'}-${documentId}`,
        yDoc,
        { params: { tenantId: tenantContext?.tenantId || 'default', userId: user.id } }
      );
      
      // Assign a random color for this user
      const userColor = USER_COLORS[Math.floor(Math.random() * USER_COLORS.length)];
      setUserColor(userColor);
      
      // Set up awareness (user presence information)
      const awareness = websocketProvider.awareness;
      awareness.setLocalState({
        userId: user.id,
        name: user.name || `User ${user.id.substring(0, 5)}`,
        color: userColor,
        cursor: null
      });
      
      // Listen for awareness updates (other users' cursor positions)
      awareness.on('update', () => {
        const states = awareness.getStates();
        const presenceInfo = Array.from(states.entries())
          .map(([clientId, state]: [number, any]) => {
            if (!state) return null;
            return {
              clientId,
              userId: state.userId,
              name: state.name,
              color: state.color,
              cursor: state.cursor
            };
          })
          .filter(Boolean) as UserPresence[];
          
        setUserPresence(presenceInfo);
      });
      
      // Listen for connection status changes
      websocketProvider.on('status', ({ status }: { status: string }) => {
        setIsConnected(status === 'connected');
      });
      
      // Set up IndexedDB provider for offline persistence
      const indexedDbProvider = new IndexeddbPersistence(
        `${tenantContext?.tenantId || 'default'}-docs`,
        yDoc
      );
      
      // Initialize the TokenStateManager
      const tokenStateManager = new TokenStateManager({
        documentId: documentId,
        userId: user.id,
        tenantId: tenantContext?.tenantId
      });
      
      // Listen for token state changes
      tokenStateManager.on('tokenStateChanged', () => {
        setTokens(tokenStateManager.getAllTokens());
        setHasConflicts(tokenStateManager.hasUnresolvedConflicts());
      });
      
      tokenStateManager.on('conflictDetected', () => {
        setHasConflicts(true);
        setShowConflictPanel(true);
      });
      
      // Listen for text changes from YJS
      yText.observe(() => {
        setContent(yText.toString());
      });
      
      // Listen for token changes from YJS
      yTokens.observe(() => {
        // Convert YJS tokens to TokenStateManager tokens
        const tokenArray = Array.from(yTokens.entries()).map(([id, tokenData]) => tokenData);
        
        // Import tokens to TokenStateManager
        tokenStateManager.importState({ tokens: tokenArray });
        
        // Update local state
        setTokens(tokenStateManager.getAllTokens());
        setHasConflicts(tokenStateManager.hasUnresolvedConflicts());
      });
      
      // Set initial state
      setContent(yText.toString());
      
      // Store references
      setDoc(yDoc);
      setWsProvider(websocketProvider);
      setDbProvider(indexedDbProvider);
      setTokenManager(tokenStateManager);
      setIsInitialized(true);
      
      // Record metrics
      const duration = performance.now() - startTime;
      metricsCollector.recordValue('demo.initialization.duration', duration, {
        documentId,
        tenantId: tenantContext?.tenantId || 'default'
      });
      
      // Redirect to URL with document ID if not already there
      if (!docId) {
        router.replace(`/demo/collaborative-editor?docId=${documentId}`, undefined, { shallow: true });
      }
      
      // Clean up on unmount
      return () => {
        // Remove awareness state
        awareness.setLocalState(null);
        
        // Disconnect WebSocket
        websocketProvider.disconnect();
        
        // Destroy providers and doc
        tokenStateManager.dispose();
        yDoc.destroy();
      };
    } catch (error) {
      console.error('Error initializing collaborative editor:', error);
      metricsCollector.increment('demo.initialization.error', {
        documentId,
        tenantId: tenantContext?.tenantId || 'default'
      });
    }
  }, [user?.id, documentId, docId, tenantContext, router, isInitialized]);
  
  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    if (!doc) return;
    
    const yText = doc.getText('content');
    
    // Apply changes to YJS document
    doc.transact(() => {
      yText.delete(0, yText.length);
      yText.insert(0, newContent);
    });
    
    setContent(newContent);
  }, [doc]);
  
  // Handle text insertion (creating new tokens)
  const handleInsertText = useCallback((text: string, position: number) => {
    if (!doc || !tokenManager) return '';
    
    // Create a new token
    const token: Token = {
      id: uuidv4(),
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.DEFAULT,
        userId: user?.id,
        timestamp: Date.now()
      }
    };
    
    // Add token to TokenStateManager
    tokenManager.addToken(token);
    
    // Add token to YJS shared state
    const yTokens = doc.getMap('tokens');
    yTokens.set(token.id, token);
    
    return token.id;
  }, [doc, tokenManager, user?.id]);
  
  // Handle token state updates
  const handleUpdateTokenState = useCallback((tokenId: string, newState: TokenState) => {
    if (!doc || !tokenManager) return;
    
    // Update token state in TokenStateManager
    tokenManager.updateTokenState(tokenId, newState);
    
    // Update token in YJS shared state
    const yTokens = doc.getMap('tokens');
    const token = tokenManager.getToken(tokenId);
    
    if (token) {
      yTokens.set(tokenId, token);
    }
  }, [doc, tokenManager]);
  
  // Handle cursor position updates
  const handleCursorPositionChange = useCallback((position: number, selection?: { start: number, end: number }) => {
    if (!wsProvider) return;
    
    const awareness = wsProvider.awareness;
    const currentState = awareness.getLocalState() || {};
    
    awareness.setLocalState({
      ...currentState,
      cursor: {
        position,
        selection
      }
    });
  }, [wsProvider]);
  
  // Handle conflict resolution completion
  const handleConflictsResolved = useCallback(() => {
    setShowConflictPanel(false);
    
    // Check if there are any remaining conflicts
    if (tokenManager) {
      setHasConflicts(tokenManager.hasUnresolvedConflicts());
    }
  }, [tokenManager]);
  
  // Share document URL handler
  const handleShareClick = useCallback(() => {
    const url = `${window.location.origin}/demo/collaborative-editor?docId=${documentId}`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(url)
      .then(() => {
        alert('Document URL copied to clipboard! Share this with collaborators.');
      })
      .catch(err => {
        console.error('Failed to copy URL:', err);
        alert(`Share this URL with collaborators: ${url}`);
      });
  }, [documentId]);
  
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
                {/* Connection status indicator */}
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
              <p>Users connected: {userPresence.length}</p>
            </div>
          </header>
          
          {/* Active users display */}
          <div className="mb-6">
            <h2 className="font-semibold mb-2">Active Users:</h2>
            <div className="flex flex-wrap gap-2">
              {userPresence.map(user => (
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
              onCursorPositionChange={handleCursorPositionChange}
              userCursors={userPresence}
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