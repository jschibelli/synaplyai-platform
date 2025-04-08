import React, { useCallback, useRef, useState, useMemo } from 'react';
import { useTokenState } from '../../hooks/useTokenState';
import { Token, TokenState } from '../../collaboration/tokens/TokenStateManager';

export interface TokenAwareDocumentVirtualizerProps {
  documentId: string;
  content: string;
  viewportHeight: number;
  lineHeight?: number;
  onSelectionChange?: (selection: { start: number, end: number, text: string }) => void;
}

export const TokenAwareDocumentVirtualizer: React.FC<TokenAwareDocumentVirtualizerProps> = ({
  documentId,
  content,
  viewportHeight,
  lineHeight = 24,
  onSelectionChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: 20 });
  const [selection, setSelection] = useState<{ start: number, end: number } | null>(null);
  
  // Get token state
  const { tokens, getTokenStyle, hasConflicts } = useTokenState(documentId);
  
  // Split content into lines for virtualization
  const lines = useMemo(() => content.split('\n'), [content]);
  const totalHeight = lines.length * lineHeight;
  
  // Calculate visible range based on scroll position
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const scrollTop = containerRef.current.scrollTop;
    const startLine = Math.floor(scrollTop / lineHeight);
    const endLine = Math.ceil((scrollTop + viewportHeight) / lineHeight);
    
    setVisibleRange({
      start: Math.max(0, startLine - 5), // Buffer of 5 lines above
      end: Math.min(lines.length, endLine + 5) // Buffer of 5 lines below
    });
  }, [lineHeight, lines.length, viewportHeight]);
  
  // Tokenize a line of text, applying styles to token ranges
  const renderTokenizedLine = useCallback((lineContent: string, lineIndex: number) => {
    // Find tokens that are on this line
    const lineStartPosition = lines.slice(0, lineIndex).join('\n').length + (lineIndex > 0 ? 1 : 0);
    const lineEndPosition = lineStartPosition + lineContent.length;
    
    // Filter tokens that overlap with this line
    const lineTokens = tokens.filter(token => {
      const tokenEnd = token.position + token.length;
      return token.position < lineEndPosition && tokenEnd > lineStartPosition;
    });
    
    // If there are no tokens on this line, return the line as-is
    if (lineTokens.length === 0) {
      return <span>{lineContent}</span>;
    }
    
    // Sort tokens by position
    lineTokens.sort((a, b) => a.position - b.position);
    
    // Create tokenized segments
    const segments: JSX.Element[] = [];
    let currentPosition = lineStartPosition;
    
    lineTokens.forEach((token, index) => {
      // If there's content before this token, add it as regular text
      if (token.position > currentPosition) {
        const untokenizedText = content.substring(currentPosition, token.position);
        segments.push(<span key={`text-${index}`}>{untokenizedText}</span>);
      }
      
      // Add the token with its style
      const tokenText = content.substring(
        Math.max(lineStartPosition, token.position), 
        Math.min(lineEndPosition, token.position + token.length)
      );
      
      segments.push(
        <span 
          key={`token-${token.id}`}
          style={getTokenStyle(token.id)}
          data-token-id={token.id}
        >
          {tokenText}
        </span>
      );
      
      currentPosition = Math.min(lineEndPosition, token.position + token.length);
    });
    
    // If there's content after the last token, add it
    if (currentPosition < lineEndPosition) {
      const remainingText = content.substring(currentPosition, lineEndPosition);
      segments.push(<span key="text-end">{remainingText}</span>);
    }
    
    return <>{segments}</>;
  }, [content, lines, tokens, getTokenStyle]);
  
  // Render visible lines with token styling
  const visibleLines = lines.slice(visibleRange.start, visibleRange.end);
  
  // Handle text selection
  const handleSelectionChange = useCallback(() => {
    if (!containerRef.current || !onSelectionChange) return;
    
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    
    const range = selection.getRangeAt(0);
    const container = containerRef.current;
    
    // Only process selections within our container
    if (!container.contains(range.startContainer) || !container.contains(range.endContainer)) {
      return;
    }
    
    // Calculate selection positions
    let startPos = 0;
    let endPos = 0;
    
    // This is a simplified approach - in a real implementation, you'd need
    // to calculate the actual character positions based on line numbers and
    // character offsets within each line
    
    const selectedText = selection.toString();
    
    setSelection({ start: startPos, end: endPos });
    onSelectionChange({ start: startPos, end: endPos, text: selectedText });
  }, [onSelectionChange]);
  
  return (
    <div className="relative">
      {hasConflicts && (
        <div className="bg-yellow-100 p-2 text-sm text-yellow-800 mb-2 rounded">
          This document has unresolved conflicts. Open the conflict panel to resolve them.
        </div>
      )}
      
      <div 
        ref={containerRef}
        onScroll={handleScroll}
        onMouseUp={handleSelectionChange}
        onKeyUp={handleSelectionChange}
        style={{ 
          height: viewportHeight, 
          overflowY: 'auto',
          position: 'relative'
        }}
        className="font-mono text-sm border rounded p-2"
        tabIndex={0}
      >
        <div style={{ height: totalHeight, position: 'relative' }}>
          <div style={{ 
            position: 'absolute', 
            top: visibleRange.start * lineHeight,
            width: '100%'
          }}>
            {visibleLines.map((line, index) => (
              <div 
                key={visibleRange.start + index}
                style={{ height: lineHeight }}
                className="whitespace-pre"
              >
                {renderTokenizedLine(line, visibleRange.start + index)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};