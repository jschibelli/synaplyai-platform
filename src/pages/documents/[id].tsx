import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { CollaborativeDocumentEditor } from '../../components/editor/CollaborativeDocumentEditor';
import { useDocument } from '../../hooks/useDocument';
import '../../styles/collaborative-editor.css';

export default function DocumentEditorPage() {
  const router = useRouter();
  const { id } = router.query;
  const documentId = typeof id === 'string' ? id : '';
  const { document, isLoading, error } = useDocument(documentId);
  const [isReadOnly, setIsReadOnly] = useState(false);
  
  // Load document access permissions
  useEffect(() => {
    if (document) {
      // Check if current user has edit permissions
      // This would typically come from your auth system
      const hasEditPermission = document.ownerId === 'current-user-id' || document.collaborators?.includes('current-user-id');
      setIsReadOnly(!hasEditPermission);
    }
  }, [document]);
  
  if (isLoading) {
    return <div className="container mx-auto p-4">Loading document...</div>;
  }
  
  if (error) {
    return <div className="container mx-auto p-4 text-red-500">Error: {error.message}</div>;
  }
  
  if (!document) {
    return <div className="container mx-auto p-4 text-red-500">Document not found</div>;
  }
  
  return (
    <div className="container mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">{document.title}</h1>
        <div className="flex items-center mt-2 text-sm text-gray-500">
          <span>Last edited: {new Date(document.updatedAt).toLocaleString()}</span>
          <span className="mx-2">•</span>
          <span>{isReadOnly ? 'View Only' : 'Edit Mode'}</span>
        </div>
      </header>
      
      <main>
        <CollaborativeDocumentEditor
          documentId={documentId}
          height={600}
          readOnly={isReadOnly}
          className="bg-white shadow-lg rounded-lg"
        />
      </main>
    </div>
  );
}