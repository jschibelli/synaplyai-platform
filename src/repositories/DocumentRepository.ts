// filepath: d:\ai-dev-projects\ai-create-assistant\src\repositories\DocumentRepository.ts
export interface DocumentRepository {
  getDocument: (id: string) => Promise<any>;
}