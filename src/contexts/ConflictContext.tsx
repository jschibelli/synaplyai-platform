import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { ConflictResolutionStrategy } from '../conflicts/ConflictResolver';
import { useVectorClock } from '../hooks/useVectorClock';
import { useWebSocket } from '../hooks/useWebSocket';
import { useSession } from '../hooks/useSession'; // Assume this hook provides user session info

// Define types for conflicts and suggestions
interface Conflict {
  id: string;
  type: string;
  localContent: string;
  remoteContent: string;
  tokens?: Array<{
    id: string;
    text: string;
    state: 'ACCEPTED' | 'REJECTED' | 'CONFLICTED';
  }>;
  vectorClocks?: {
    local: Record<string, number>;
    remote: Record<string, number>;
  };
}

interface Suggestion {
  id: string;
  content: string;
  state: 'CONFLICTED' | 'UPDATED';
}

interface ConflictContextProps {
  activeConflicts: Conflict[];
  relatedSuggestions: Record<string, Suggestion[]>;
  loadConflictsForDocument: (documentId: string) => Promise<void>;
  resolveConflict: (resolution: {
    conflictId: string;
    strategy: ConflictResolutionStrategy;
    mergedContent?: string;
  }) => Promise<void>;
}

const ConflictContext = createContext<ConflictContextProps | undefined>(undefined);

export const useConflictContext = () => {
  const context = useContext(ConflictContext);
  if (!context) {
    throw new Error('useConflictContext must be used within a ConflictProvider');
  }
  return context;
};

export const ConflictProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeConflicts, setActiveConflicts] = useState<Conflict[]>([]);
  const [relatedSuggestions, setRelatedSuggestions] = useState<Record<string, Suggestion[]>>({});
  const [documentId, setDocumentId] = useState<string | null>(null);
  
  const { user } = useSession();
  const userId = user?.id || 'anonymous';
  
  const socket = useWebSocket();
  const { vectorClock, incrementClock, areConcurrent } = useVectorClock(
    documentId || 'global', 
    userId
  );
  
  // Listen for conflict notifications from server
  useEffect(() => {
    if (!socket) return;
    
    socket.on('conflict_detected', (data) => {
      if (data.documentId === documentId) {
        setActiveConflicts(prevConflicts => [
          ...prevConflicts,
          {
            ...data.conflict,
            vectorClocks: {
              local: vectorClock.getClock(),
              remote: data.remoteVectorClock
            }
          }
        ]);
        
        // Set related suggestions if provided
        if (data.relatedSuggestions && data.relatedSuggestions.length > 0) {
          setRelatedSuggestions(prev => ({
            ...prev,
            [data.conflict.id]: data.relatedSuggestions
          }));
        }
      }
    });
    
    return () => {
      socket.off('conflict_detected');
    };
  }, [socket, documentId, vectorClock]);
  
  const loadConflictsForDocument = useCallback(async (docId: string) => {
    setDocumentId(docId);
    
    try {
      // Call API to get active conflicts
      const conflictService = new ConflictService();
      const conflicts = await conflictService.getActiveConflicts(docId);
      
      // Update state with conflicts
      setActiveConflicts(conflicts);
      
      // Load related suggestions for each conflict
      const suggestionPromises = conflicts.map(conflict => 
        conflictService.getRelatedSuggestions(docId, conflict.id)
      );
      
      const suggestionsResults = await Promise.all(suggestionPromises);
      
      // Create a map of conflict ID to suggestions
      const suggestionsMap: Record<string, Suggestion[]> = {};
      conflicts.forEach((conflict, index) => {
        suggestionsMap[conflict.id] = suggestionsResults[index];
      });
      
      setRelatedSuggestions(suggestionsMap);
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
      // Increment vector clock for this resolution
      const updatedClock = incrementClock();
      
      // Call API to resolve conflict
      const conflictService = new ConflictService();
      await conflictService.resolveConflict({
        ...resolution,
        vectorClock: updatedClock.getClock(),
        userId
      });
      
      // Remove resolved conflict from state
      setActiveConflicts(prevConflicts => 
        prevConflicts.filter(conflict => conflict.id !== resolution.conflictId)
      );
      
      // Remove related suggestions
      setRelatedSuggestions(prev => {
        const updated = { ...prev };
        delete updated[resolution.conflictId];
        return updated;
      });
      
      // Notify other clients via WebSocket
      if (socket) {
        socket.emit('conflict_resolved', {
          documentId,
          conflictId: resolution.conflictId,
          strategy: resolution.strategy,
          vectorClock: updatedClock.getClock(),
          userId
        });
      }
    } catch (error) {
      console.error('Failed to resolve conflict:', error);
    }
  }, [documentId, userId, incrementClock, socket]);
  
  const contextValue: ConflictContextProps = {
    activeConflicts,
    relatedSuggestions,
    loadConflictsForDocument,
    resolveConflict
  };
  
  return (
    <ConflictContext.Provider value={contextValue}>
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
  
  async resolveConflict(resolution: {
    conflictId: string;
    strategy: ConflictResolutionStrategy;
    mergedContent?: string;
    vectorClock: Record<string, number>;
    userId: string;
  }) {
    const response = await fetch(`${this.apiUrl}/resolve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resolution)
    });
    
    if (!response.ok) {
      throw new Error('Failed to resolve conflict');
    }
    
    return response.json();
  }
}

export const conflictService = new ConflictService();