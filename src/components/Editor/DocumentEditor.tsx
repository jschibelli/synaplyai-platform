import React, { useState, useCallback } from 'react';
import { DocumentVirtualizer } from './DocumentVirtualizer';
import { ConflictPanel } from './ConflictPanel';
import { useDocument } from '../../hooks/useDocument';
import { useTokenState } from '../../hooks/useTokenState';

interface DocumentEditorProps {
  documentId: string;
  height?: number;
  readOnly?: boolean;
  onContentChange?: (content: string) => void;
  className?: string;
}

/**
 * A complete document editor with virtualization, token state management,
 * and conflict resolution
 */
export const DocumentEditor: React.FC<DocumentEditorProps> = ({
  documentId,
  height = 500,
  readOnly = false,
  onContentChange,
  className = ''
}) => {
  const { document, isLoading: isDocumentLoading, updateDocument } = useDocument(documentId);
  const { hasConflicts, isLoading: isTokenLoading } = useTokenState(documentId);
  const [selection, setSelection] = useState<{ start: number, end: number, text: string } | null>(null);
  const [showConflictPanel, setShowConflictPanel] = useState(false);
  
  // Handle content changes
  const handleContentChange = useCallback((newContent: string) => {
    if (readOnly) return;
    
    // Update document in database
    if (document) {
      updateDocument({ 
        ...document, 
        content: newContent 
      });
    }
    
    // Notify parent component
    if (onContentChange) {
      onContentChange(newContent);
    }
  }, [document, updateDocument, onContentChange, readOnly]);
  
  // Handle selection changes
  const handleSelectionChange = useCallback((sel: { start: number, end: number, text: string }) => {
    setSelection(sel);
  }, []);
  
  // Handle conflict resolution complete
  const handleConflictResolved = useCallback(() => {
    setShowConflictPanel(false);
  }, []);
  
  // Loading state
  if (isDocumentLoading || isTokenLoading) {
    return <div className="p-4 bg-gray-100 rounded">Loading document editor...</div>;
  }
  
  // Error state
  if (!document) {
    return <div className="p-4 bg-red-100 text-red-800 rounded">Document not found</div>;
  }
  
  return (
    <div className={`document-editor ${className}`}>
      {/* Conflict notification and toggle */}
      {hasConflicts && (
        <div className="flex justify-between items-center bg-yellow-100 p-3 rounded mb-4">
          <div className="text-yellow-800">
            <span className="font-bold">⚠️ Conflicts detected</span>
            <span className="ml-2">There are conflicts that need to be resolved</span>
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
      
      {/* Document virtualizer */}
      <DocumentVirtualizer
        documentId={documentId}
        content={document.content}
        viewportHeight={height}
        onSelectionChange={handleSelectionChange}
        onContentChange={handleContentChange}
        readOnly={readOnly}
      />
      
      {/* Floating action buttons */}
      <div className="fixed bottom-4 right-4 flex flex-col space-y-2">
        {hasConflicts && (
          <button
            onClick={() => setShowConflictPanel(!showConflictPanel)}
            className="p-3 bg-yellow-500 text-white rounded-full shadow-lg hover:bg-yellow-600"
            title={showConflictPanel ? "Hide Conflict Panel" : "Show Conflict Panel"}
          >
            ⚠️
          </button>
        )}
      </div>
    </div>
  );
};