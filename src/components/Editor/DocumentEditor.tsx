import React from 'react';

export interface DocumentEditorProps {
  documentId: string;
  userId?: string;
  document?: any; // Make document optional
  readOnly?: boolean;
  onSave?: (content: string) => void;
  onError?: (error: Error) => void;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = (props) => {
  const documentId = props.documentId || props.document?.id;
  const { document, onConflict, onResolve, readOnly } = props;
  // This file exists only to support importing in tests
  return <div>Document Editor</div>;
};