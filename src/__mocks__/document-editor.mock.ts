import { DocumentEditorProps, ConflictType, ResolutionType } from '../tests/test-interfaces';

/**
 * Creates a standardized mock for the DocumentEditor component
 */
export function createDocumentEditorMock() {
  return jest.fn().mockImplementation(
    ({ document, documentId, userId, onConflict, onResolve, onChange }: DocumentEditorProps) => {
      // Allow passing either document object or documentId
      const doc = document || { 
        id: documentId || 'mock-doc-id',
        content: 'Mock document content',
        metadata: {}
      };
      
      return {
        render: () => '<div>Mock Document Editor</div>',
        update: jest.fn(),
        getContent: jest.fn().mockReturnValue(doc.content),
        
        // Add explicit type annotations
        triggerConflict: (conflict: ConflictType) => {
          if (onConflict) onConflict(conflict);
        },
        
        resolveConflict: (resolution: ResolutionType) => {
          if (onResolve) onResolve(resolution);
        },
        
        documentId: doc.id,
        userId: userId || 'mock-user-id',
        content: doc.content,
        
        // Mock DOM methods
        getAttribute: jest.fn().mockImplementation((attr: string) => {
          if (attr === 'data-document-id') return doc.id;
          if (attr === 'data-user-id') return userId;
          return null;
        }),
        
        // Change handler
        handleChange: jest.fn().mockImplementation((newContent: string) => {
          if (onChange) onChange(newContent);
          return newContent;
        })
      };
    }
  );
}