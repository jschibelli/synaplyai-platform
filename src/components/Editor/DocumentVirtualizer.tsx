import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';
import { useTokenState } from '../../hooks/useTokenState';
import { metricsCollector } from '../../metrics/metrics-collector';

export interface DocumentVirtualizerProps {
  documentId: string;
  content: string;
  viewportHeight: number;
  lineHeight?: number;
  onSelectionChange?: (selection: { start: number, end: number, text: string }) => void;
  onContentChange?: (content: string) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * A virtualized document editor that integrates with TokenStateManager
 * for collaborative editing and conflict resolution
 */
export const DocumentVirtualizer: React.FC<DocumentVirtualizerProps> = ({
  documentId,
  content,
  viewportHeight,
  lineHeight = 24,
  onSelectionChange,
  onContentChange,
  readOnly = false,
  className = ''
}) => {
  // References and state
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [selection, setSelection] = useState<{ start: number, end: number } | null>(null);
  const [initialized, setInitialized] = useState(false);
  
  // Integrate with token state manager
  const {
    tokens,
    hasConflicts,
    addToken,
    updateTokenState,
    getTokenStyle,
    isLoading
  } = useTokenState(documentId);
  
  // Split content into lines for virtualization
  const lines = useMemo(() => {
    const startTime = performance.now();
    const result = content.split('\n');
    
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('document.split_lines.duration', duration, {
      documentId,
      lineCount: result.length.toString()
    });
    
    return result;
  }, [content, documentId]);
  
  // Calculate total document height
  const totalHeight = useMemo(() => lines.length * lineHeight, [lines.length, lineHeight]);
  
  // Initialize component after mount
  useEffect(() => {
    if (!initialized && containerRef.current) {
      handleScroll(); // Calculate initial visible range
      setInitialized(true);
    }
  }, [initialized]);
  
  // Calculate visible range based on scroll position
  const handleScroll = useCallback(() => {
    const startTime = performance.now();
    
    if (!containerRef.current) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const startLine = Math.floor(scrollTop / lineHeight);
    const visibleLines = Math.ceil(viewportHeight / lineHeight);
    const endLine = startLine + visibleLines;
    
    // Add buffer zones for smoother scrolling (5 lines above and below)
    const bufferSize = 5;
    const newStartLine = Math.max(0, startLine - bufferSize);
    const newEndLine = Math.min(lines.length, endLine + bufferSize);
    
    if (newStartLine !== visibleRange.start || newEndLine !== visibleRange.end) {
      setVisibleRange({
        start: newStartLine,
        end: newEndLine
      });
    }
    
    const duration = performance.now() - startTime;
    metricsCollector.recordValue('document.scroll_calculation.duration', duration, {
      documentId,
      viewportHeight: viewportHeight.toString(),
      visibleLines: visibleLines.toString()
    });
  }, [lineHeight, lines.length, viewportHeight, visibleRange, documentId]);
  
  // Handle text selection
  const handleSelectionChange = useCallback(() => {
    if (!containerRef.current || !editorRef.current || !onSelectionChange) return;
    
    const nativeSelection = window.getSelection();
    if (!nativeSelection || nativeSelection.rangeCount === 0) return;
    
    const range = nativeSelection.getRangeAt(0);
    
    // Only process selections within our container
    if (!editorRef.current.contains(range.startContainer) || !editorRef.current.contains(range.endContainer)) {
      return;
    }
    
    // Calculate selection positions based on text nodes
    const selectedText = nativeSelection.toString();
    
    // This is a simplified approach - in real implementation,
    // you'd need more sophisticated position calculation
    const editorContent = editorRef.current.textContent || '';
    const startPos = editorContent.indexOf(selectedText);
    const endPos = startPos + selectedText.length;
    
    if (startPos >= 0) {
      const newSelection = { 
        start: startPos, 
        end: endPos, 
        text: selectedText 
      };
      
      setSelection(newSelection);
      onSelectionChange(newSelection);
    }
  }, [onSelectionChange]);
  
  // Handle text insertion (e.g. from typing or pasting)
  const handleTextInsertion = useCallback((text: string, position: number) => {
    if (readOnly) return;
    
    // Add token to token state manager
    addToken({
      text,
      position,
      length: text.length,
      metadata: {
        state: TokenState.DEFAULT,
        timestamp: Date.now()
      }
    });
    
    // Update content
    if (onContentChange) {
      const newContent = 
        content.substring(0, position) + 
        text + 
        content.substring(position);
      
      onContentChange(newContent);
    }
  }, [addToken, content, onContentChange, readOnly]);
  
  // Tokenize a line of text for rendering with state-based styling
  const renderTokenizedLine = useCallback((lineContent: string, lineIndex: number) => {
    // Calculate the absolute position of this line in the document
    const lineStartPosition = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
    const lineEndPosition = lineStartPosition + lineContent.length;
    
    // Get tokens that overlap with this line
    const lineTokens = tokens.filter(token => {
      const tokenEnd = token.position + token.length;
      return token.position < lineEndPosition && tokenEnd > lineStartPosition;
    });
    
    // If no tokens on this line, return the line as plain text
    if (lineTokens.length === 0) {
      return <span>{lineContent}</span>;
    }
    
    // Sort tokens by position
    lineTokens.sort((a, b) => a.position - b.position);
    
    // Create segments with token styling
    const segments: JSX.Element[] = [];
    let currentPosition = lineStartPosition;
    
    lineTokens.forEach((token, index) => {
      // Add text before this token if there's a gap
      if (token.position > currentPosition) {
        const untokenizedText = content.substring(currentPosition, token.position);
        segments.push(<span key={`text-${index}`}>{untokenizedText}</span>);
      }
      
      // Get the part of the token text that belongs to this line
      const tokenText = content.substring(
        Math.max(lineStartPosition, token.position), 
        Math.min(lineEndPosition, token.position + token.length)
      );
      
      // Add the token with its style
      segments.push(
        <span 
          key={`token-${token.id}`}
          style={getTokenStyle(token.id)}
          data-token-id={token.id}
          className="token"
          title={`State: ${token.metadata.state}`}
          onClick={() => handleTokenClick(token.id)}
        >
          {tokenText}
        </span>
      );
      
      currentPosition = Math.min(lineEndPosition, token.position + token.length);
    });
    
    // Add any remaining text after the last token
    if (currentPosition < lineEndPosition) {
      const remainingText = content.substring(currentPosition, lineEndPosition);
      segments.push(<span key="text-end">{remainingText}</span>);
    }
    
    return <>{segments}</>;
  }, [content, lines, tokens, getTokenStyle]);
  
  // Handle click on a token
  const handleTokenClick = useCallback((tokenId: string) => {
    if (readOnly) return;
    
    const token = tokens.find(t => t.id === tokenId);
    if (!token) return;
    
    // If token is in conflict state, show a simple resolution UI
    if (token.metadata.state === TokenState.CONFLICT) {
      const accept = window.confirm(`Accept changes for "${token.text}"?`);
      if (accept) {
        updateTokenState(tokenId, TokenState.ACCEPTED);
      } else {
        updateTokenState(tokenId, TokenState.REJECTED);
      }
    }
  }, [tokens, updateTokenState, readOnly]);
  
  // Get visible lines for rendering
  const visibleLines = useMemo(() => 
    lines.slice(visibleRange.start, visibleRange.end),
    [lines, visibleRange]
  );
  
  // Handle simple text input (in a real implementation, you'd have
  // a more sophisticated editor with content editable or a text area)
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly || !selection) return;
    
    // Example: handle basic text insertion on keydown
    if (e.key.length === 1) { // Single character
      e.preventDefault();
      handleTextInsertion(e.key, selection.start);
      setSelection({
        start: selection.start + 1,
        end: selection.start + 1,
        text: ''
      });
    }
  }, [readOnly, selection, handleTextInsertion]);
  
  if (isLoading) {
    return <div className="p-4 bg-gray-100 rounded">Loading document...</div>;
  }
  
  return (
    <div className={`document-virtualizer ${className}`}>
      {hasConflicts && (
        <div className="bg-yellow-100 p-2 text-sm text-yellow-800 mb-2 rounded">
          This document has unresolved conflicts. Open the conflict panel to resolve them.
        </div>
      )}
      
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        style={{ 
          height: viewportHeight, 
          overflowY: 'auto',
          position: 'relative',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '8px'
        }}
        className="document-viewport"
        onMouseUp={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        onKeyDown={handleKeyDown}
        tabIndex={0}
      >
        <div 
          ref={editorRef}
          style={{ 
            height: totalHeight, 
            position: 'relative',
            fontFamily: 'monospace'
          }}
          className="document-content"
        >
          <div 
            style={{ 
              position: 'absolute', 
              top: visibleRange.start * lineHeight,
              width: '100%'
            }}
            className="visible-content"
          >
            {visibleLines.map((line, index) => (
              <div 
                key={visibleRange.start + index}
                style={{ 
                  height: lineHeight, 
                  lineHeight: `${lineHeight}px`,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word'
                }}
                className="document-line"
              >
                {renderTokenizedLine(line, visibleRange.start + index)}
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {selection && (
        <div className="mt-2 p-2 text-sm text-gray-600 border-t">
          Selection: {selection.start}-{selection.end} ({selection.text ? selection.text.length : 0} chars)
        </div>
      )}
    </div>
  );
};