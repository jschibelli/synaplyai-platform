import { ConflictResolutionStrategy } from '../conflicts/ConflictResolver';

class ConflictService {
  private apiUrl = '/api/conflicts';

  async getActiveConflicts(documentId: string) {
    const response = await fetch(`${this.apiUrl}/${documentId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch conflicts');
    }
    return response.json();
  }
  
  async getRelatedSuggestions(documentId: string, conflictId: string) {
    const response = await fetch(`${this.apiUrl}/${documentId}/suggestions/${conflictId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch related suggestions');
    }
    return response.json();
  }
  
  async resolveConflict(
    documentId: string,
    conflictId: string,
    strategy: ConflictResolutionStrategy,
    mergedContent?: string
  ) {
    const response = await fetch(`${this.apiUrl}/${documentId}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        conflictId,
        strategy,
        mergedContent
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to resolve conflict');
    }
    
    return response.json();
  }
  
  async getConflictStatistics(documentId: string) {
    const response = await fetch(`${this.apiUrl}/${documentId}/statistics`);
    if (!response.ok) {
      throw new Error('Failed to fetch conflict statistics');
    }
    return response.json();
  }
}

export const conflictService = new ConflictService();