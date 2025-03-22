export class DocumentContext {
  documentId: string;
  userId: string;
  content: string;

  constructor(documentId: string, userId: string, content: string) {
    this.documentId = documentId;
    this.userId = userId;
    this.content = content;
  }
}