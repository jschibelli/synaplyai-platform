import { DocumentReconstructor } from '../../src/collaboration/DocumentReconstructor';
import { EventStore } from '../../src/collaboration/events/EventStore';
import { SnapshotStore } from '../../src/collaboration/snapshots/SnapshotStore';
import { OperationalTransform } from '../../src/collaboration/conflict/OperationalTransform';
import { MetricsCollector } from '../../src/metrics/collector';

jest.mock('../../src/collaboration/events/EventStore');
jest.mock('../../src/collaboration/snapshots/SnapshotStore');
jest.mock('../../src/lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ 
    tenantId: 'test-tenant', 
    userId: 'test-user' 
  })
}));

describe('DocumentReconstructor', () => {
  let documentReconstructor: DocumentReconstructor;
  let eventStore: jest.Mocked<EventStore>;
  let snapshotStore: jest.Mocked<SnapshotStore>;
  let operationalTransform: OperationalTransform;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    eventStore = new EventStore({} as any, {} as any) as jest.Mocked<EventStore>;
    snapshotStore = new SnapshotStore({} as any, {} as any) as jest.Mocked<SnapshotStore>;
    operationalTransform = new OperationalTransform();
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create DocumentReconstructor instance
    documentReconstructor = new DocumentReconstructor(
      eventStore,
      snapshotStore,
      operationalTransform,
      metricsCollector
    );
    
    // Mock standard methods
    eventStore.replayEvents = jest.fn().mockResolvedValue([]);
    snapshotStore.getLatestSnapshot = jest.fn().mockResolvedValue(null);
    snapshotStore.shouldCreateSnapshot = jest.fn().mockResolvedValue(false);
    snapshotStore.createSnapshot = jest.fn().mockResolvedValue({} as any);
  });
  
  test('should reconstruct document from scratch when no snapshot exists', async () => {
    // Mock events
    const events = [
      {
        id: 'event-1',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 1,
        timestamp: Date.now() - 1000,
        payload: {
          position: 0,
          text: 'Hello'
        }
      },
      {
        id: 'event-2',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 2,
        timestamp: Date.now() - 500,
        payload: {
          position: 5,
          text: ' world'
        }
      }
    ];
    
    // Mock event store to return test events
    eventStore.replayEvents.mockResolvedValue(events);
    
    // Reconstruct document
    const document = await documentReconstructor.reconstructDocument('doc-1');
    
    // Verify result
    expect(document.content).toBe('Hello world');
    expect(document.version).toBe(2);
    expect(eventStore.replayEvents).toHaveBeenCalledWith('doc-1', 0);
    expect(snapshotStore.getLatestSnapshot).toHaveBeenCalledWith('doc-1');
    expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
      'document.reconstruction',
      expect.any(Number)
    );
  });
  
  test('should reconstruct document from snapshot plus events', async () => {
    // Mock snapshot
    const snapshot = {
      id: 'snapshot-1',
      documentId: 'doc-1',
      tenantId: 'test-tenant',
      state: {
        content: 'Hello',
        formatting: {},
        metadata: {},
        version: 1
      },
      version: 1,
      timestamp: Date.now() - 1000,
      lastEventId: 'event-1'
    };
    
    // Mock events after snapshot
    const events = [
      {
        id: 'event-2',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 2,
        timestamp: Date.now() - 500,
        payload: {
          position: 5,
          text: ' world'
        }
      }
    ];
    
    // Set up mocks
    snapshotStore.getLatestSnapshot.mockResolvedValue(snapshot);
    eventStore.replayEvents.mockResolvedValue(events);
    
    // Reconstruct document
    const document = await documentReconstructor.reconstructDocument('doc-1');
    
    // Verify result
    expect(document.content).toBe('Hello world');
    expect(document.version).toBe(2);
    expect(eventStore.replayEvents).toHaveBeenCalledWith('doc-1', 1);
    expect(snapshotStore.getLatestSnapshot).toHaveBeenCalledWith('doc-1');
  });
  
  test('should reconstruct document to specific version', async () => {
    // Mock events
    const events = [
      {
        id: 'event-1',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 1,
        timestamp: Date.now() - 1000,
        payload: {
          position: 0,
          text: 'Hello'
        }
      },
      {
        id: 'event-2',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 2,
        timestamp: Date.now() - 500,
        payload: {
          position: 5,
          text: ' world'
        }
      },
      {
        id: 'event-3',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 3,
        timestamp: Date.now() - 200,
        payload: {
          position: 11,
          text: '!'
        }
      }
    ];
    
    // Mock event store to return test events
    eventStore.replayEvents.mockResolvedValue(events);
    
    // Reconstruct document to version 2 (exclude event-3)
    const document = await documentReconstructor.reconstructDocument('doc-1', 2);
    
    // Verify result
    expect(document.content).toBe('Hello world');
    expect(document.version).toBe(2);
  });
  
  test('should create snapshot in background when document reconstruction is slow', async () => {
    // Mock events
    const events = Array.from({ length: 51 }, (_, i) => ({
      id: `event-${i+1}`,
      type: 'INSERT_TEXT',
      documentId: 'doc-1',
      userId: 'user-1',
      tenantId: 'test-tenant',
      version: i+1,
      timestamp: Date.now() - (1000 - i*10),
      payload: {
        position: i,
        text: 'a'
      }
    }));
    
    // Mock methods
    eventStore.replayEvents.mockResolvedValue(events);
    snapshotStore.shouldCreateSnapshot.mockResolvedValue(true);
    
    // Reconstruct document
    await documentReconstructor.reconstructDocument('doc-1');
    
    // Verify snapshot creation was attempted
    expect(snapshotStore.shouldCreateSnapshot).toHaveBeenCalledWith('doc-1');
    expect(snapshotStore.createSnapshot).toHaveBeenCalled();
  });
  
  test('should handle various event types correctly', async () => {
    // Mock events with different types
    const events = [
      {
        id: 'event-1',
        type: 'INSERT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 1,
        timestamp: Date.now() - 1000,
        payload: {
          position: 0,
          text: 'Hello world'
        }
      },
      {
        id: 'event-2',
        type: 'FORMAT_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 2,
        timestamp: Date.now() - 800,
        payload: {
          position: 0,
          length: 5,
          attributes: {
            bold: true
          }
        }
      },
      {
        id: 'event-3',
        type: 'DELETE_TEXT',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 3,
        timestamp: Date.now() - 600,
        payload: {
          position: 5,
          length: 1
        }
      },
      {
        id: 'event-4',
        type: 'SET_METADATA',
        documentId: 'doc-1',
        userId: 'user-1',
        tenantId: 'test-tenant',
        version: 4,
        timestamp: Date.now() - 400,
        payload: {
          key: 'title',
          value: 'Document Title'
        }
      }
    ];
    
    // Mock event store
    eventStore.replayEvents.mockResolvedValue(events);
    
    // Reconstruct document
    const document = await documentReconstructor.reconstructDocument('doc-1');
    
    // Verify result contains all expected changes
    expect(document.content).toBe('Helloworld');
    expect(document.formatting['0:5']).toEqual({ bold: true });
    expect(document.metadata.title).toBe('Document Title');
    expect(document.version).toBe(4);
  });
});