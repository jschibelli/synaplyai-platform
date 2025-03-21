import React, { createContext, useContext, useState, useCallback } from 'react';
import { ConflictType, ConflictResolutionStrategy } from '../conflicts/ConflictResolver';
import { conflictService } from '../services/ConflictService';

interface Conflict {
  id: string;
  type: ConflictType;
  localContent: string;
  remoteContent: string;
  tokens?: Array<{
    id: string;
    text: string;
    state: 'ACCEPTED' | 'REJECTED' | 'CONFLICTED';
  }>;
}

interface RelatedSuggestion {
  id: string;
  content: string;
  state: 'CONFLICTED' | 'UPDATED';
}

interface ConflictContextType {
  activeConflicts: Conflict[];
  relatedSuggestions: Record<string, RelatedSuggestion[]>;
  loadConflictsForDocument: (documentId: string) => Promise<void>;
  resolveConflict: (resolution: {
    conflictId: string;
    strategy: ConflictResolutionStrategy;
    mergedContent?: string;
  }) => Promise<void>;
}

const ConflictContext = createContext<ConflictContextType>({
  activeConflicts: [],
  relatedSuggestions: {},
  loadConflictsForDocument: async () => {},
  resolveConflict: async () => {}
});

export const useConflictContext = () => useContext(ConflictContext);

export const ConflictProvider: React.FC<{children: React.ReactNode}> = ({ children }) => {
  const [activeConflicts, setActiveConflicts] = useState<Conflict[]>([]);
  const [relatedSuggestions, setRelatedSuggestions] = useState<Record<string, RelatedSuggestion[]>>({});

  const loadConflictsForDocument = useCallback(async (documentId: string) => {
    try {
      const conflicts = await conflictService.getActiveConflicts(documentId);
      setActiveConflicts(conflicts);
      
      // Load related suggestions for each conflict
      const suggestions: Record<string, RelatedSuggestion[]> = {};
      for (const conflict of conflicts) {
        suggestions[conflict.id] = await conflictService.getRelatedSuggestions(documentId, conflict.id);
      }
      setRelatedSuggestions(suggestions);
    } catch (error) {
      console.error('Failed to load conflicts:', error);
    }
  }, []);

  const resolveConflict = useCallback(async (resolution: {
    conflictId: string;
    strategy: ConflictResolutionStrategy;
    mergedContent?: string;
  }) => {
    try {
      const documentId = activeConflicts.find(c => c.id === resolution.conflictId)?.id;
      if (!documentId) return;
      
      await conflictService.resolveConflict(
        documentId,
        resolution.conflictId, 
        resolution.strategy,
        resolution.mergedContent
      );
      
      // Remove the resolved conflict from state
      setActiveConflicts(prev => 
        prev.filter(conflict => conflict.id !== resolution.conflictId)
      );
      
      // Remove related suggestions for the resolved conflict
      setRelatedSuggestions(prev => {
        const updated = { ...prev };
        delete updated[resolution.conflictId];
        return updated;
      });
      
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  }, [activeConflicts]);

  return (
    <ConflictContext.Provider value={{ 
      activeConflicts, 
      relatedSuggestions,
      loadConflictsForDocument, 
      resolveConflict 
    }}>
      {children}
    </ConflictContext.Provider>
  );
};

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