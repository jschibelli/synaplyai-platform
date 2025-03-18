import { SnapshotManager, SnapshotConfig } from '../../../src/collaboration/snapshots/SnapshotManager';
import { SnapshotStore, Snapshot, SnapshotMetadata } from '../../../src/collaboration/snapshots/SnapshotStore';
import { EventStore } from '../../../src/collaboration/events/EventStore';
import { MetricsCollector } from '../../../src/metrics/collector';
import { ComplianceLogger } from '../../../src/compliance/logger';
import { getTenantContext, setTenantContext, clearTenantContext } from '../../../src/lib/tenant-context';

// Mock dependencies
jest.mock('../../../src/collaboration/snapshots/SnapshotStore');
jest.mock('../../../src/collaboration/events/EventStore');
jest.mock('../../../src/metrics/collector');
jest.mock('../../../src/compliance/logger');
jest.mock('../../../src/lib/tenant-context');

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
      getSnapshotByVersion: jest.fn(),
      pruneOldSnapshots: jest.fn()
    } as unknown as jest.Mocked<SnapshotStore>;
    
    eventStore = {
      getEventCountSinceVersion: jest.fn(),
      appendEvent: jest.fn(),
      getEvents: jest.fn()
    } as unknown as jest.Mocked<EventStore>;
    
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
      recordValue: jest.fn().mockResolvedValue(undefined),
      getAverageValue: jest.fn(),
      getCountValue: jest.fn(),
      track: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Mock tenant context
    (getTenantContext as jest.Mock).mockReturnValue({
      tenantId: 'test-tenant',
      userId: 'test-user',
      requestId: 'test-request'
    });
    
    // Default config for testing
    const config: SnapshotConfig = {
      minEventCount: 10,
      maxEventCount: 100,
      minTimeSinceLastSnapshot: 1000,
      targetReconstructionTime: 50,
      compressionTarget: 0.7,
      keepVersions: 3
    };
    
    // Create snapshot manager
    snapshotManager = new SnapshotManager(
      snapshotStore,
      eventStore,
      metricsCollector,
      config
    );
    
    // Mock ComplianceLogger
    (ComplianceLogger.log as jest.Mock).mockResolvedValue(undefined);
  });
  
  afterEach(() => {
    jest.clearAllMocks();
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
      expect(metricsCollector.track).toHaveBeenCalledWith('snapshot.decision', 1, 
        expect.objectContaining({
          documentId: 'doc-1',
          reason: 'event_count',
          count: 150,
          threshold: 100
        })
      );
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
    
    test('should return true if time threshold exceeded', async () => {
      const now = Date.now();
      const oldTime = new Date(now - 120000).toISOString(); // 2 minutes ago (more than minTimeSinceLastSnapshot)
      
      // Set up mocks - old snapshot exists
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
      metricsCollector.getCountValue.mockResolvedValue(5); // Lower than access threshold
      
      // Check if snapshot should be created
      const result = await snapshotManager.shouldCreateSnapshot('doc-1', 'tenant-1');
      
      // Should be true since time since last snapshot exceeds threshold
      expect(result).toBe(true);
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
      expect(metricsCollector.track).toHaveBeenCalledWith('snapshot.decision', 1, 
        expect.objectContaining({
          documentId: 'doc-1',
          reason: 'slow_reconstruction'
        })
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
      expect(metricsCollector.track).toHaveBeenCalledWith('snapshot.decision', 1, 
        expect.objectContaining({
          documentId: 'doc-1',
          reason: 'high_access'
        })
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
      
      // Verify compression metrics for objects
      expect(metricsCollector.recordValue).toHaveBeenCalledWith(
        'snapshot.compression.ratio',
        expect.any(Number)
      );
      
      // Verify compliance logging
      expect(ComplianceLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.snapshot.created',
          resourceId: 'doc-1',
          metadata: expect.objectContaining({
            tenantId: 'tenant-1',
            version: 10
          })
        })
      );
      
      // Verify old snapshots are pruned
      expect(snapshotStore.pruneOldSnapshots).toHaveBeenCalledWith('doc-1', 'tenant-1', 3);
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
      await expect(
        snapshotManager.createSnapshot('doc-1', 'tenant-1', document, version)
      ).rejects.toThrow(error);
      
      // Verify failure metric was recorded
      expect(metricsCollector.increment).toHaveBeenCalledWith(
        'snapshot.creation.failed',
        1
      );
      
      // Verify failure was logged
      expect(ComplianceLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.snapshot.failed',
          resourceId: 'doc-1',
          metadata: expect.objectContaining({
            error: 'Snapshot creation failed'
          })
        })
      );
    });
    
    test('should handle tenant context in snapshot creation', async () => {
      // Setup tenant context
      (getTenantContext as jest.Mock).mockReturnValue({
        tenantId: 'context-tenant',
        userId: 'context-user'
      });
      
      // Mock document and version
      const document = { content: 'Test content' };
      const version = 5;
      
      // Mock dependencies
      eventStore.getEventCountSinceVersion.mockResolvedValue(25);
      snapshotStore.createSnapshot.mockImplementation((docId, tenId, data, metadata) => {
        return Promise.resolve({
          id: 'test-snap',
          documentId: docId,
          tenantId: tenId,
          version: metadata.version,
          data,
          metadata,
          timestamp: new Date().toISOString(),
          createdBy: 'context-user'
        });
      });
      
      // Create snapshot
      await snapshotManager.createSnapshot('doc-1', 'tenant-1', document, version);
      
      // Verify tenant context was used for logging
      expect(ComplianceLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({
            createdBy: 'context-user'
          })
        })
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
      
      // Verify access was tracked
      expect(metricsCollector.increment).toHaveBeenCalledWith('document.access.count.doc-1', 1);
    });
    
    test('should handle null snapshot result', async () => {
      // Mock no snapshot found
      snapshotStore.getLatestSnapshot.mockResolvedValue(null);
      
      // Get snapshot
      const result = await snapshotManager.getLatestSnapshot('doc-1', 'tenant-1');
      
      // Should return null
      expect(result).toBeNull();
      
      // Should not track access for non-existent snapshot
      expect(metricsCollector.increment).not.toHaveBeenCalled();
    });
    
    test('should handle errors', async () => {
      // Mock error
      const error = new Error('Database error');
      snapshotStore.getLatestSnapshot.mockRejectedValue(error);
      
      // Attempt to get snapshot
      await expect(
        snapshotManager.getLatestSnapshot('doc-1', 'tenant-1')
      ).rejects.toThrow(error);
      
      // Verify error metric
      expect(metricsCollector.increment).toHaveBeenCalledWith('snapshot.get.failed', 1);
    });
  });
  
  describe('getSnapshotByVersion', () => {
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
      snapshotStore.getSnapshotByVersion.mockResolvedValue(snapshot);
      
      // Get snapshot by version
      const result = await snapshotManager.getSnapshotByVersion('doc-1', 'tenant-1', 5);
      
      // Verify correct parameters and result
      expect(snapshotStore.getSnapshotByVersion).toHaveBeenCalledWith('doc-1', 'tenant-1', 5);
      expect(result).toBe(snapshot);
    });
    
    test('should handle errors', async () => {
      // Mock error
      const error = new Error('Database error');
      snapshotStore.getSnapshotByVersion.mockRejectedValue(error);
      
      // Attempt to get snapshot
      await expect(
        snapshotManager.getSnapshotByVersion('doc-1', 'tenant-1', 5)
      ).rejects.toThrow(error);
      
      // Verify error metric
      expect(metricsCollector.increment).toHaveBeenCalledWith('snapshot.getByVersion.failed', 1);
    });
  });
  
  describe('hasSnapshotForVersion', () => {
    test('should return true when snapshot exists', async () => {
      // Mock snapshot exists
      snapshotStore.getSnapshotByVersion.mockResolvedValue({
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 5,
        data: {},
        metadata: { version: 5, documentId: 'doc-1', timestamp: 'test', eventCount: 50 },
        timestamp: 'test'
      });
      
      // Check if snapshot exists
      const result = await snapshotManager.hasSnapshotForVersion('doc-1', 'tenant-1', 5);
      
      // Should be true
      expect(result).toBe(true);
    });
    
    test('should return false when snapshot does not exist', async () => {
      // Mock no snapshot found
      snapshotStore.getSnapshotByVersion.mockResolvedValue(null);
      
      // Check if snapshot exists
      const result = await snapshotManager.hasSnapshotForVersion('doc-1', 'tenant-1', 5);
      
      // Should be false
      expect(result).toBe(false);
    });
    
    test('should return false when error occurs', async () => {
      // Mock error
      snapshotStore.getSnapshotByVersion.mockRejectedValue(new Error('Database error'));
      
      // Check if snapshot exists
      const result = await snapshotManager.hasSnapshotForVersion('doc-1', 'tenant-1', 5);
      
      // Should be false due to error
      expect(result).toBe(false);
    });
  });
  
  describe('pruneOldSnapshots', () => {
    test('should call snapshotStore.pruneOldSnapshots with correct parameters', async () => {
      // Mock successful pruning
      snapshotStore.pruneOldSnapshots.mockResolvedValue(2);
      
      // Call private method through a public method that uses it
      await snapshotManager.createSnapshot('doc-1', 'tenant-1', { test: 'data' }, 10);
      
      // Verify pruneOldSnapshots was called with correct parameters
      expect(snapshotStore.pruneOldSnapshots).toHaveBeenCalledWith('doc-1', 'tenant-1', 3);
    });
    
    test('should log pruning through compliance logger', async () => {
      // Mock successful pruning that removed snapshots
      snapshotStore.pruneOldSnapshots.mockResolvedValue(3);
      
      // Call private method through a public method that uses it
      await snapshotManager.createSnapshot('doc-1', 'tenant-1', { test: 'data' }, 10);
      
      // Verify compliance logging
      expect(ComplianceLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventType: 'document.snapshot.pruned',
          resourceId: 'doc-1',
          metadata: expect.objectContaining({
            count: 3,
            keepVersions: 3
          })
        })
      );
    });
    
    test('should handle errors during pruning without failing', async () => {
      // Mock error during pruning
      const error = new Error('Pruning error');
      snapshotStore.pruneOldSnapshots.mockRejectedValue(error);
      
      // Should not throw error when pruning fails
      await snapshotManager.createSnapshot('doc-1', 'tenant-1', { test: 'data' }, 10);
      
      // Verify error metric was recorded
      expect(metricsCollector.increment).toHaveBeenCalledWith('snapshot.prune.error', 1);
    });
  });
});