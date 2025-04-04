import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';
import { YjsUserAwareness } from '../../hooks/useYjsCollaboration';
import { metricsCollector } from '../../metrics/metrics-collector';

export interface DocumentVirtualizerProps {
  documentId: string;
  content: string;
  tokens: Token[];
  viewportHeight: number;
  lineHeight?: number;
  onSelectionChange?: (selection: { start: number, end: number, text: string }) => void;
  onContentChange?: (content: string) => void;
  onInsertText?: (text: string, position: number) => string;
  onUpdateTokenState?: (tokenId: string, newState: TokenState) => void;
  getTokenStyle?: (token: Token) => React.CSSProperties;
  userCursors?: YjsUserAwareness[];
  readOnly?: boolean;
  className?: string;
}

/**
 * A virtualized document editor component with collaborative features
 */
export const DocumentVirtualizer: React.FC<DocumentVirtualizerProps> = ({
  documentId,
  content,
  tokens,
  viewportHeight,
  lineHeight = 24,
  onSelectionChange,
  onContentChange,
  onInsertText,
  onUpdateTokenState,
  getTokenStyle = () => ({}),
  userCursors = [],
  readOnly = false,
  className = ''
}) => {
  // References
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  
  // State
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [selection, setSelection] = useState<{ start: number, end: number } | null>(null);
  const [initialized, setInitialized] = useState(false);
  
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
  
  // Calculate cursor positions for remote users
  const cursorPositions = useMemo(() => {
    return userCursors.map(user => {
      if (!user.cursor) return null;
      
      // Calculate line index and character offset for cursor position
      let remainingChars = user.cursor.position;
      let lineIndex = 0;
      
      while (lineIndex < lines.length && remainingChars > lines[lineIndex].length) {
        remainingChars -= lines[lineIndex].length + 1; // +1 for newline
        lineIndex++;
      }
      
      return {
        ...user,
        lineIndex,
        charOffset: remainingChars
      };
    }).filter(Boolean);
  }, [userCursors, lines]);
  
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
    
    // Calculate selection positions
    const selectedText = nativeSelection.toString();
    
    // This is a simplified approach - in real implementation,
    // you'd need more sophisticated position calculation
    const editorContent = editorRef.current.textContent || '';
    const startPos = editorContent.indexOf(selectedText);
    const endPos = startPos + selectedText.length;
    
    if (startPos >= 0) {
      const newSelection = { 
        start: startPos, 
        end: endPos 
      };
      
      setSelection(newSelection);
      onSelectionChange({
        ...newSelection,
        text: selectedText
      });
    }
  }, [onSelectionChange]);
  
  // Handle text insertion
  const handleTextInsertion = useCallback((text: string, position: number) => {
    if (readOnly || !onInsertText || !onContentChange) return;
    
    // Create token via callback
    onInsertText(text, position);
    
    // Update content
    const newContent = 
      content.substring(0, position) + 
      text + 
      content.substring(position);
    
    onContentChange(newContent);
  }, [readOnly, onInsertText, onContentChange, content]);
  
  // Handle token click (for accepting/rejecting)
  const handleTokenClick = useCallback((token: Token) => {
    if (readOnly || !onUpdateTokenState) return;
    
    // If token is in conflict state, show resolution UI
    if (token.metadata.state === TokenState.CONFLICT) {
      const accept = window.confirm(`Accept changes for "${token.text}"?`);
      if (accept) {
        onUpdateTokenState(token.id, TokenState.ACCEPTED);
      } else {
        onUpdateTokenState(token.id, TokenState.REJECTED);
      }
    }
  }, [readOnly, onUpdateTokenState]);
  
  // Render a line with tokens and remote cursors
  const renderLine = useCallback((lineContent: string, lineIndex: number) => {
    // Calculate the absolute position of this line in the document
    const lineStartPosition = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
    const lineEndPosition = lineStartPosition + lineContent.length;
    
    // Get tokens that overlap with this line
    const lineTokens = tokens.filter(token => {
      const tokenEnd = token.position + token.length;
      return token.position < lineEndPosition && tokenEnd > lineStartPosition;
    });
    
    // Find cursors on this line
    const cursorsOnLine = cursorPositions.filter(cursor => 
      cursor && cursor.lineIndex === lineIndex
    );
    
    // If no tokens or cursors on this line, return the line as plain text
    if (lineTokens.length === 0 && cursorsOnLine.length === 0) {
      return <span>{lineContent}</span>;
    }
    
    // Sort tokens by position
    lineTokens.sort((a, b) => a.position - b.position);
    
    // Create segments with token styling
    const segments: JSX.Element[] = [];
    let currentPosition = lineStartPosition;
    
    // Function to add cursor at a specific position
    const addCursorsAt = (position: number) => {
      const cursorsAtPosition = cursorsOnLine.filter(cursor => 
        cursor && cursor.charOffset === position - lineStartPosition
      );
      
      cursorsAtPosition.forEach(cursor => {
        if (!cursor) return;
        
        segments.push(
          <span 
            key={`cursor-${cursor.clientId}`}
            className="user-cursor"
            style={{ 
              backgroundColor: cursor.color,
              width: '2px',
              height: `${lineHeight}px`,
              display: 'inline-block',
              position: 'relative',
              top: '2px',
              marginRight: '-2px'
            }}
            title={cursor.name}
          />
        );
        
        // Add user name label above cursor
        segments.push(
          <span 
            key={`cursor-label-${cursor.clientId}`}
            className="user-cursor-label"
            style={{ 
              backgroundColor: cursor.color,
              color: 'white',
              fontSize: '10px',
              padding: '2px 4px',
              borderRadius: '2px',
              position: 'absolute',
              top: `-${lineHeight}px`,
              left: '0px',
              whiteSpace: 'nowrap'
            }}
          >
            {cursor.name}
          </span>
        );
      });
    };
    
    lineTokens.forEach((token, index) => {
      // Add any cursors before this token
      const tokenStart = Math.max(lineStartPosition, token.position);
      
      // Add text before this token if there's a gap
      if (tokenStart > currentPosition) {
        // Add cursors before the text
        cursorsOnLine.forEach(cursor => {
          if (!cursor) return;
          
          const cursorPos = lineStartPosition + cursor.charOffset;
          if (cursorPos >= currentPosition && cursorPos < tokenStart) {
            const textBefore = content.substring(currentPosition, cursorPos);
            if (textBefore) {
              segments.push(<span key={`text-before-${index}-${cursorPos}`}>{textBefore}</span>);
            }
            
            addCursorsAt(cursorPos);
            currentPosition = cursorPos;
          }
        });
        
        // Add remaining text before token
        if (tokenStart > currentPosition) {
          const untokenizedText = content.substring(currentPosition, tokenStart);
          segments.push(<span key={`text-${index}`}>{untokenizedText}</span>);
        }
      }
      
      // Get the part of the token text that belongs to this line
      const tokenText = content.substring(
        Math.max(lineStartPosition, token.position), 
        Math.min(lineEndPosition, token.position + token.length)
      );
      
      // Add the token with its style
      const tokenStyle = getTokenStyle(token);
      segments.push(
        <span 
          key={`token-${token.id}`}
          style={tokenStyle}
          data-token-id={token.id}
          className="token"
          title={`Token: ${token.id} (${token.metadata.state})`}
          onClick={() => handleTokenClick(token)}
        >
          {tokenText}
        </span>
      );
      
      currentPosition = Math.min(lineEndPosition, token.position + token.length);
    });
    
    // Add any remaining cursors after tokens
    cursorsOnLine.forEach(cursor => {
      if (!cursor) return;
      
      const cursorPos = lineStartPosition + cursor.charOffset;
      if (cursorPos >= currentPosition && cursorPos <= lineEndPosition) {
        const textBefore = content.substring(currentPosition, cursorPos);
        if (textBefore) {
          segments.push(<span key={`text-after-${cursorPos}`}>{textBefore}</span>);
        }
        
        addCursorsAt(cursorPos);
        currentPosition = cursorPos;
      }
    });
    
    // Add any remaining text after the last token and cursor
    if (currentPosition < lineEndPosition) {
      const remainingText = content.substring(currentPosition, lineEndPosition);
      segments.push(<span key="text-end">{remainingText}</span>);
    }
    
    return <>{segments}</>;
  }, [content, lines, tokens, cursorPositions, lineHeight, getTokenStyle, handleTokenClick]);
  
  // Get visible lines for rendering
  const visibleLines = useMemo(() => 
    lines.slice(visibleRange.start, visibleRange.end),
    [lines, visibleRange]
  );
  
  // Handle keyboard input
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (readOnly || !selection) return;
    
    // Example: handle basic text insertion on keydown
    if (e.key.length === 1) { // Single character
      e.preventDefault();
      handleTextInsertion(e.key, selection.start);
      setSelection({
        start: selection.start + 1,
        end: selection.start + 1
      });
    }
  }, [readOnly, selection, handleTextInsertion]);
  
  return (
    <div className={`document-virtualizer ${className}`}>
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        style={{ 
          height: viewportHeight, 
          overflowY: 'auto',
          position: 'relative',
          border: '1px solid #ddd',
          borderRadius: '4px',
          padding: '8px',
          fontFamily: 'monospace'
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
            position: 'relative'
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
                  wordBreak: 'break-word',
                  position: 'relative'
                }}
                className="document-line"
                data-line-index={visibleRange.start + index}
              >
                {renderLine(line, visibleRange.start + index)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};