import { SnapshotManager, SnapshotConfig } from '../../../src/collaboration/snapshots/SnapshotManager';
import { SnapshotStore } from '../../../src/collaboration/snapshots/SnapshotStore';
import { EventStore } from '../../../src/collaboration/events/EventStore';
import { MetricsCollector } from '../../../src/metrics/collector';

// Mock dependencies
jest.mock('../../../src/collaboration/snapshots/SnapshotStore');
jest.mock('../../../src/collaboration/events/EventStore');
jest.mock('../../../src/metrics/collector');

describe('SnapshotManager', () => {
  let snapshotManager: SnapshotManager;
  let snapshotStore: jest.Mocked<SnapshotStore>;
  let eventStore: jest.Mocked<EventStore>;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    snapshotStore = {
      createSnapshot: jest.fn(),
      getLatestSnapshot: jest.fn(),
      getSnapshotByVersion: jest.fn()
    } as unknown as jest.Mocked<SnapshotStore>;
    
    eventStore = {
      getEventCountSinceVersion: jest.fn()
    } as unknown as jest.Mocked<EventStore>;
    
    metricsCollector = {
      recordLatency: jest.fn(),
      increment: jest.fn(),
      getAverageValue: jest.fn(),
      getCountValue: jest.fn()
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Default config for testing
    const config: SnapshotConfig = {
      minEventCount: 10,
      maxEventCount: 100,
      minTimeSinceLastSnapshot: 1000,
      targetReconstructionTime: 50
    };
    
    // Create snapshot manager
    snapshotManager = new SnapshotManager(
      snapshotStore,
      eventStore,
      metricsCollector,
      config
    );
  });
  
  describe('shouldCreateSnapshot', () => {
    test('should return true if event count exceeds max threshold', async () => {
      // Set up mocks
      snapshotStore.getLatestSnapshot.mockResolvedValue(null);
      eventStore.getEventCountSinceVersion.mockResolvedValue(150);
      
      // Check if snapshot should be created
      const result = await snapshotManager.shouldCreateSnapshot('doc-1', 'tenant-1');
      
      // Should be true since event count > maxEventCount
      expect(result).toBe(true);
      
      // Verify mocks were called correctly
      expect(snapshotStore.getLatestSnapshot).toHaveBeenCalledWith('doc-1', 'tenant-1');
      expect(eventStore.getEventCountSinceVersion).toHaveBeenCalledWith('doc-1', 0, 'tenant-1');
    });
    
    test('should return false if event count below min threshold', async () => {
      // Set up mocks
      snapshotStore.getLatestSnapshot.mockResolvedValue(null);
      eventStore.getEventCountSinceVersion.mockResolvedValue(5);
      
      // Check if snapshot should be created
      const result = await snapshotManager.shouldCreateSnapshot('doc-1', 'tenant-1');
      
      // Should be false since event count < minEventCount
      expect(result).toBe(false);
    });
    
    test('should consider time since last snapshot', async () => {
      const now = Date.now();
      const recentTime = new Date(now - 500).toISOString(); // 500ms ago (less than minTimeSinceLastSnapshot)
      
      // Set up mocks - recent snapshot exists
      snapshotStore.getLatestSnapshot.mockResolvedValue({
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 5,
        data: {},
        metadata: { version: 5, documentId: 'doc-1', timestamp: recentTime, eventCount: 50 },
        timestamp: recentTime
      });
      
      eventStore.getEventCountSinceVersion.mockResolvedValue(50); // Between min and max
      
      // Check if snapshot should be created
      const result = await snapshotManager.shouldCreateSnapshot('doc-1', 'tenant-1');
      
      // Should be false since last snapshot was too recent
      expect(result).toBe(false);
    });
    
    test('should consider document reconstruction time', async () => {
      const oldTime = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
      
      // Set up mocks
      snapshotStore.getLatestSnapshot.mockResolvedValue({
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 5,
        data: {},
        metadata: { version: 5, documentId: 'doc-1', timestamp: oldTime, eventCount: 50 },
        timestamp: oldTime
      });
      
      eventStore.getEventCountSinceVersion.mockResolvedValue(50); // Between min and max
      metricsCollector.getAverageValue.mockResolvedValue(100); // Higher than targetReconstructionTime
      
      // Check if snapshot should be created
      const result = await snapshotManager.shouldCreateSnapshot('doc-1', 'tenant-1');
      
      // Should be true since reconstruction time is high
      expect(result).toBe(true);
      expect(metricsCollector.getAverageValue).toHaveBeenCalledWith(
        'document.reconstruction.time.doc-1',
        expect.any(Object)
      );
    });
    
    test('should consider document access frequency', async () => {
      const oldTime = new Date(Date.now() - 10000).toISOString(); // 10 seconds ago
      
      // Set up mocks
      snapshotStore.getLatestSnapshot.mockResolvedValue({
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 5,
        data: {},
        metadata: { version: 5, documentId: 'doc-1', timestamp: oldTime, eventCount: 50 },
        timestamp: oldTime
      });
      
      eventStore.getEventCountSinceVersion.mockResolvedValue(50); // Between min and max
      metricsCollector.getAverageValue.mockResolvedValue(20); // Lower than targetReconstructionTime
      metricsCollector.getCountValue.mockResolvedValue(15); // Higher than threshold (10)
      
      // Check if snapshot should be created
      const result = await snapshotManager.shouldCreateSnapshot('doc-1', 'tenant-1');
      
      // Should be true since document is frequently accessed
      expect(result).toBe(true);
      expect(metricsCollector.getCountValue).toHaveBeenCalledWith(
        'document.access.count.doc-1',
        expect.any(Object)
      );
    });
  });
  
  describe('createSnapshot', () => {
    test('should create a snapshot via snapshotStore', async () => {
      // Mock document and version
      const document = { content: 'Test document', metadata: { title: 'Test' } };
      const version = 10;
      
      // Mock event count
      eventStore.getEventCountSinceVersion.mockResolvedValue(50);
      
      // Mock snapshot creation
      const createdSnapshot = {
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: version,
        data: document,
        metadata: { version, documentId: 'doc-1', timestamp: expect.any(String), eventCount: 50 },
        timestamp: expect.any(String)
      };
      snapshotStore.createSnapshot.mockResolvedValue(createdSnapshot);
      
      // Create snapshot
      const result = await snapshotManager.createSnapshot('doc-1', 'tenant-1', document, version);
      
      // Verify snapshot was created with correct parameters
      expect(snapshotStore.createSnapshot).toHaveBeenCalledWith(
        'doc-1',
        'tenant-1',
        document,
        expect.objectContaining({
          version,
          documentId: 'doc-1',
          timestamp: expect.any(String),
          eventCount: 50
        })
      );
      
      // Verify result
      expect(result).toBe(createdSnapshot);
      
      // Verify metrics were recorded
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'snapshot.creation.time',
        expect.any(Number)
      );
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'snapshot.created',
        1
      );
    });
    
    test('should handle snapshot creation failure', async () => {
      // Mock document and version
      const document = { content: 'Test document' };
      const version = 10;
      
      // Mock event count
      eventStore.getEventCountSinceVersion.mockResolvedValue(50);
      
      // Mock snapshot creation failure
      const error = new Error('Snapshot creation failed');
      snapshotStore.createSnapshot.mockRejectedValue(error);
      
      // Attempt to create snapshot
      await expect(snapshotManager.createSnapshot('doc-1', 'tenant-1', document, version))
        .rejects.toThrow(error);
      
      // Verify failure metric was recorded
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'snapshot.creation.failed',
        1
      );
    });
  });
  
  describe('getLatestSnapshot', () => {
    test('should delegate to snapshotStore', async () => {
      // Mock snapshot
      const snapshot = {
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 5,
        data: { content: 'Test' },
        metadata: { version: 5, documentId: 'doc-1', timestamp: 'test', eventCount: 50 },
        timestamp: 'test'
      };
      snapshotStore.getLatestSnapshot.mockResolvedValue(snapshot);
      
      // Get snapshot
      const result = await snapshotManager.getLatestSnapshot('doc-1', 'tenant-1');
      
      // Verify correct parameters and result
      expect(snapshotStore.getLatestSnapshot).toHaveBeenCalledWith('doc-1', 'tenant-1');
      expect(result).toBe(snapshot);
    });
  });
});