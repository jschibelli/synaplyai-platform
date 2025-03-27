import React from 'react';

export interface DocumentEditorProps {
  document: any;
  documentId?: string; // Add for backward compatibility
  userId?: string;     // Add for backward compatibility
  // Other props
  onConflict?: (conflict: any) => void;
  onResolve?: (resolution: any) => void;
  readOnly?: boolean;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = (props) => {
  const documentId = props.documentId || props.document?.id;
  const { document, onConflict, onResolve, readOnly } = props;
  // This file exists only to support importing in tests
  return <div>Document Editor</div>;
};