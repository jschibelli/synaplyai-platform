import React, { useState, useCallback } from 'react';
import { TokenAwareDocumentVirtualizer } from './TokenAwareDocumentVirtualizer';
import { ConflictPanel } from './ConflictPanel';
import { useDocument } from '../../hooks/useDocument';
import { useTokenState } from '../../hooks/useTokenState';

interface TokenAwareDocumentEditorProps {
  documentId: string;
  height?: number;
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
}

export const TokenAwareDocumentEditor: React.FC<TokenAwareDocumentEditorProps> = ({
  documentId,
  height = 500,
  readOnly = false,
  onContentChange
}) => {
  const { document, isLoading: isDocumentLoading, updateDocument } = useDocument(documentId);
  const { hasConflicts, isLoading: isTokenLoading } = useTokenState(documentId);
  const [selection, setSelection] = useState<{ start: number, end: number, text: string } | null>(null);
  
  const handleContentChange = useCallback((newContent: string) => {
    if (readOnly) return;
    
    updateDocument({ 
      ...document!, 
      content: newContent 
    });
    
    if (onContentChange) {
      onContentChange(newContent);
    }
  }, [document, updateDocument, onContentChange, readOnly]);
  
  const handleSelectionChange = useCallback((sel: { start: number, end: number, text: string }) => {
    setSelection(sel);
  }, []);
  
  if (isDocumentLoading || isTokenLoading) {
    return <div className="p-4">Loading document...</div>;
  }
  
  if (!document) {
    return <div className="p-4">Document not found</div>;
  }
  
  return (
    <div>
      {hasConflicts && (
        <ConflictPanel 
          documentId={documentId} 
          className="mb-4"
        />
      )}
      
      <TokenAwareDocumentVirtualizer
        documentId={documentId}
        content={document.content}
        viewportHeight={height}
        onSelectionChange={handleSelectionChange}
      />
      
      {selection && (
        <div className="mt-2 p-2 border-t text-sm text-gray-500">
          Selected: {selection.text.length} characters from position {selection.start}
        </div>
      )}
    </div>
  );
};