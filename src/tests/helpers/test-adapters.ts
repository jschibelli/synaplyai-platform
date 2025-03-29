import { Conflict, ConflictType, ConflictResolution, ConflictResolutionStrategy } from '../../collaboration/conflict/types';
import { BaseEvent, DocumentEvent } from '../../collaboration/events/types';

/**
 * Converts test conflict objects to TypeScript interface format
 */
export function createTestConflict(testData: any): Conflict {
  return {
    id: testData.id || `conflict-${Date.now()}`,
    documentId: testData.documentId || testData.aggregateId || 'test-doc',
    localEvent: testData.localEvent || convertToDocumentEvent(testData.local),
    remoteEvent: testData.remoteEvent || convertToDocumentEvent(testData.remote),
    type: testData.type || ConflictType.TEXT_EDIT,
    severity: testData.severity || 'medium',
    description: testData.description || 'Test conflict',
    createdAt: testData.createdAt || Date.now(),
    
    // Backward compatibility fields
    local: testData.local,
    remote: testData.remote,
    localRegion: testData.localRegion,
    remoteRegion: testData.remoteRegion
  };
}

/**
 * Converts older event format to DocumentEvent
 */
function convertToDocumentEvent(event: any): DocumentEvent {
  if (!event) return {} as DocumentEvent;
  
  return {
    id: event.id || `event-${Date.now()}`,
    documentId: event.documentId || event.aggregateId || 'unknown',
    userId: event.userId || 'unknown',
    type: event.type || 'UNKNOWN',
    timestamp: event.timestamp || Date.now(),
    payload: event.payload || {},
    
    // Maintain backward compatibility
    aggregateId: event.aggregateId || event.documentId,
    version: event.version || 1,
    tenantId: event.tenantId || 'test-tenant'
  } as DocumentEvent;
}