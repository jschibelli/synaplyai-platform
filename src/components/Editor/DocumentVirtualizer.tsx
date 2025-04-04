import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';
import { UserPresence } from '../../hooks/useYjsCollaboration';
import { useTenantContext } from '../../hooks/useTenantContext';
import { metricsCollector } from '../../metrics/metrics-collector';

interface DocumentVirtualizerProps {
  documentId: string;
  content: string;
  tokens: Token[];
  viewportHeight: number;
  userCursors?: UserPresence[];
  onContentChange?: (content: string) => void;
  onInsertText?: (text: string, position: number) => string;
  onUpdateTokenState?: (tokenId: string, newState: TokenState) => void;
  onCursorPositionChange?: (position: number) => void;
  onSelectionChange?: (selection: { start: number, end: number, text: string }) => void;
}

export const DocumentVirtualizer: React.FC<DocumentVirtualizerProps> = ({
  documentId,
  content,
  tokens,
  viewportHeight,
  userCursors = [],
  onContentChange,
  onInsertText,
  onUpdateTokenState,
  onCursorPositionChange,
  onSelectionChange
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [visibleContent, setVisibleContent] = useState<string>(content);
  const [selectionRange, setSelectionRange] = useState<{ start: number, end: number } | null>(null);
  const tenantContext = useTenantContext();
  
  // Track performance metrics
  const renderStartTime = useRef<number>(0);
  
  // Calculate line heights and visible range
  const lineHeight = 22; // Average line height in pixels
  const visibleLines = Math.ceil(viewportHeight / lineHeight);
  
  // Handle scroll to implement virtualization
  const handleScroll = useCallback(() => {
    if (!editorRef.current) return;
    
    const scrollTop = editorRef.current.scrollTop;
    const startLine = Math.floor(scrollTop / lineHeight);
    const endLine = startLine + visibleLines + 10; // Add buffer
    
    // Calculate content slice based on visible range
    // In a real implementation, this would be more sophisticated
    // Here we're simplifying by just using the full content for demo
    setVisibleContent(content);
    
    // Track analytics
    metricsCollector.recordValue('editor.scroll', scrollTop, {
      documentId,
      tenantId: tenantContext?.tenantId || 'default'
    });
  }, [content, documentId, tenantContext, visibleLines]);
  
  // Initialize and handle content changes
  useEffect(() => {
    handleScroll();
    
    // Track render performance
    renderStartTime.current = performance.now();
    
    return () => {
      const renderDuration = performance.now() - renderStartTime.current;
      metricsCollector.recordValue('editor.render.duration', renderDuration, {
        documentId,
        tenantId: tenantContext?.tenantId || 'default'
      });
    };
  }, [content, handleScroll, documentId, tenantContext]);
  
  // Process tokens to create highlighted content with proper states
  const processedContent = useMemo(() => {
    if (!tokens || tokens.length === 0) return visibleContent;
    
    // Sort tokens by position to process them in order
    const sortedTokens = [...tokens].sort((a, b) => a.position - b.position);
    
    // This is a simplified implementation
    // A full implementation would use a more efficient algorithm
    let result = visibleContent;
    let offset = 0;
    
    sortedTokens.forEach(token => {
      const tokenClassName = getTokenClassName(token.metadata.state);
      const tokenStart = token.position + offset;
      const tokenEnd = tokenStart + token.length;
      
      // Insert token markup
      const before = result.substring(0, tokenStart);
      const tokenText = result.substring(tokenStart, tokenEnd);
      const after = result.substring(tokenEnd);
      
      result = `${before}<span class="token ${tokenClassName}" data-token-id="${token.id}">${tokenText}</span>${after}`;
      
      // Update offset for subsequent tokens
      offset += `<span class="token ${tokenClassName}" data-token-id="${token.id}">`.length + '</span>'.length;
    });
    
    return result;
  }, [visibleContent, tokens]);
  
  // Handle cursor position changes
  const handleCursorPositionChange = useCallback(() => {
    if (!editorRef.current || !onCursorPositionChange) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const editorNode = editorRef.current;
    
    // Calculate cursor position
    let position = 0;
    const traverseNode = (node: Node, range: Range): number => {
      if (node === range.startContainer) {
        return position + range.startOffset;
      }
      
      if (node.nodeType === Node.TEXT_NODE) {
        position += node.textContent?.length || 0;
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          const childNode = node.childNodes[i];
          const result = traverseNode(childNode, range);
          if (result !== -1) return result;
        }
      }
      
      return -1;
    };
    
    const cursorPosition = traverseNode(editorNode, range);
    if (cursorPosition !== -1) {
      onCursorPositionChange(cursorPosition);
    }
  }, [onCursorPositionChange]);
  
  // Handle selection changes
  const handleSelectionChange = useCallback(() => {
    if (!editorRef.current || !onSelectionChange) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    
    // Calculate selection range and text
    // This is a simplified implementation
    const start = getTextPosition(editorRef.current, range.startContainer, range.startOffset);
    const end = getTextPosition(editorRef.current, range.endContainer, range.endOffset);
    
    if (start !== -1 && end !== -1) {
      const selectionText = content.substring(start, end);
      setSelectionRange({ start, end });
      onSelectionChange({ start, end, text: selectionText });
    }
  }, [content, onSelectionChange]);
  
  // Handle content edits
  const handleInput = useCallback((e: React.FormEvent<HTMLDivElement>) => {
    if (!onContentChange) return;
    
    // Get plain text content
    const newContent = e.currentTarget.innerText;
    onContentChange(newContent);
  }, [onContentChange]);
  
  // Handle token state updates (e.g., accepting/rejecting)
  const handleTokenClick = useCallback((e: React.MouseEvent) => {
    if (!onUpdateTokenState) return;
    
    const target = e.target as HTMLElement;
    const tokenElement = target.closest('.token');
    
    if (tokenElement) {
      const tokenId = tokenElement.getAttribute('data-token-id');
      if (tokenId) {
        // Toggle token state for demo purposes
        // In a real app, you'd show a menu or use a more sophisticated UI
        onUpdateTokenState(tokenId, TokenState.ACCEPTED);
      }
    }
  }, [onUpdateTokenState]);
  
  // Render user cursors from YJS awareness
  const renderUserCursors = useMemo(() => {
    return userCursors.map(user => {
      if (!user.cursor) return null;
      
      // Calculate cursor position in the DOM
      // This is a simplified approach
      const cursorPosition = user.cursor.position;
      
      // Create a cursor element
      return (
        <div 
          key={`cursor-${user.clientId}`}
          className="user-cursor"
          style={{
            position: 'absolute',
            left: `${cursorPosition * 8}px`, // Approximate position
            top: 0,
            height: lineHeight,
            width: '2px',
            backgroundColor: user.color,
            zIndex: 10
          }}
          data-user={user.name}
        >
          <div 
            className="user-cursor-label"
            style={{
              backgroundColor: user.color,
              color: 'white',
              padding: '2px 4px',
              borderRadius: '2px',
              fontSize: '10px',
              whiteSpace: 'nowrap',
              position: 'absolute',
              top: '-18px',
              left: 0
            }}
          >
            {user.name}
          </div>
        </div>
      );
    }).filter(Boolean);
  }, [userCursors, lineHeight]);
  
  return (
    <div className="document-virtualizer-container" style={{ position: 'relative' }}>
      <div 
        ref={editorRef}
        className="document-content-editable"
        contentEditable={true}
        suppressContentEditableWarning={true}
        onScroll={handleScroll}
        onInput={handleInput}
        onClick={handleTokenClick}
        onKeyUp={handleCursorPositionChange}
        onMouseUp={handleSelectionChange}
        style={{
          height: viewportHeight,
          overflowY: 'auto',
          padding: '12px',
          backgroundColor: 'white',
          lineHeight: `${lineHeight}px`,
          whiteSpace: 'pre-wrap',
          outline: 'none'
        }}
        dangerouslySetInnerHTML={{ __html: processedContent }}
      />
      
      {/* Render user cursors */}
      {renderUserCursors}
    </div>
  );
};

// Helper function to get token class name based on state
function getTokenClassName(state: TokenState): string {
  switch (state) {
    case TokenState.ACCEPTED:
      return 'token-state-accepted';
    case TokenState.REJECTED:
      return 'token-state-rejected';
    case TokenState.CONFLICT:
      return 'token-state-conflict';
    case TokenState.PENDING:
      return 'token-state-pending';
    default:
      return 'token-state-default';
  }
}

// Helper function to calculate text position
function getTextPosition(root: Node, node: Node, offset: number): number {
  // Implementation would traverse the DOM to find text position
  // This is a placeholder for the actual implementation
  return 0;
}