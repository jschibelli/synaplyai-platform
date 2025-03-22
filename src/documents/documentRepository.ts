import { mockDocument } from './mockDocument';

export class DocumentRepository {
  async getDocument(documentId: string): Promise<typeof mockDocument> {
    // Simulate fetching a document by ID
    if (documentId === mockDocument.id) {
      return mockDocument;
    }
    throw new Error('Document not found');
  }
}

export const documentRepository = new DocumentRepository();