import { jest } from '@jest/globals';
import { prisma } from '../../../__mocks__/prisma.mock';
import { metricsCollectorMock } from '../../../src/__mocks__/metrics-collector.mock';
import { SnapshotStore } from '../../../src/collaboration/snapshots/SnapshotStore';

jest.mock('../../../__mocks__/prisma.mock');

describe('SnapshotStore', () => {
  let snapshotStore: SnapshotStore;

  beforeEach(() => {
    jest.clearAllMocks();
    snapshotStore = new SnapshotStore(prisma, metricsCollectorMock);
  });

  describe('createSnapshot', () => {
    test('should create a new snapshot with proper data', async () => {
      // Document state
      const documentState = { content: 'Test document content', formatting: {} };
      
      // Mock snapshot creation
      const mockSnapshot = {
        id: expect.any(String),
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: documentState,
        version: 10,
        timestamp: expect.any(Number),
        metadata: {}
      };
      prisma.snapshot.create.mockImplementation(() => Promise.resolve(mockSnapshot));
      
      // Create snapshot
      const result = await snapshotStore.createSnapshot('doc-1', documentState, 10, { 
        createdBy: 'test-user',
        compressionLevel: 'high'
      });
      
      // Verify snapshot data was correctly passed
      expect(prisma.snapshot.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          state: documentState,
          version: 10
        })
      });
      
      // Verify result matches mock
      expect(result).toEqual(mockSnapshot);
      
      // Verify metrics were recorded
      expect(metricsCollector.recordLatency).toHaveBeenCalledWith(
        'snapshot.create',
        expect.any(Number)
      );
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.created',
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          version: 10
        })
      );
    });
    
    test('should use transaction client when provided', async () => {
      // Mock transaction client
      const transactionClient = {
        snapshot: {
          create: jest.fn().mockImplementation(() => Promise.resolve({
            id: 'snap-tx-1',
            version: 5
          }))
        }
      };
      
      // Create snapshot with transaction client
      await snapshotStore.createSnapshot(
        'doc-1', 
        { content: 'test' }, 
        5, 
        { client: transactionClient }
      );
      
      // Verify transaction client was used instead of prisma
      expect(transactionClient.snapshot.create).toHaveBeenCalled();
      expect(prisma.snapshot.create).not.toHaveBeenCalled();
    });
    
    test('should include custom metadata when provided', async () => {
      // Create snapshot with custom metadata
      const metadata = { author: 'test-user', reason: 'manual' };
      
      prisma.snapshot.create.mockImplementationOnce((data) => Promise.resolve(data.data));
      
      const result = await snapshotStore.createSnapshot(
        'doc-1',
        { content: 'test' },
        5,
        { metadata }
      );
      
      // Verify metadata was included
      expect(result.metadata).toEqual(metadata);
    });
  });

  describe('getLatestSnapshot', () => {
    it('should return the latest snapshot for a document', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        data: JSON.stringify({ content: 'Test content', version: 10 }),
        version: 10,
        timestamp: Date.now(),
        metadata: {
          version: 10,
          documentId: 'doc-1',
          timestamp: Date.now(),
          eventCount: 5
        }
      };

      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(mockSnapshot));

      const result = await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      expect(result).toEqual(mockSnapshot);
      expect(prisma.snapshot.findFirst).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'tenant-1'
        },
        orderBy: {
          version: 'desc'
        }
      });
    });

    test('should return null when no snapshot exists', async () => {
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(null));
      
      const result = await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      
      expect(result).toBeNull();
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.retrieved',
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          found: false
        })
      );
    });
    
    test('should use cache for subsequent calls', async () => {
      // Mock snapshot for first call
      const mockSnapshot: Snapshot = {
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: { content: 'test content' },
        version: 10,
        timestamp: Date.now(),
        data: {},
        metadata: {}
      };
      
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(mockSnapshot));
      
      // First call should query database
      const result1 = await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      expect(result1).toEqual(mockSnapshot);
      expect(prisma.snapshot.findFirst).toHaveBeenCalledTimes(1);
      
      // Second call should use cache
      const result2 = await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      expect(result2).toEqual(mockSnapshot);
      
      // Database should not be queried again
      expect(prisma.snapshot.findFirst).toHaveBeenCalledTimes(1);
      expect(metricsCollector.increment).toHaveBeenCalledWith('snapshot.cache.hit', 1);
    });
    
    test('should clear cache when requested', async () => {
      // Mock snapshot
      const mockSnapshot: Snapshot = {
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: { content: 'test content' },
        version: 10,
        timestamp: Date.now(),
        data: {},
        metadata: {}
      };
      
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(mockSnapshot));
      
      // First call to populate cache
      await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      
      // Clear cache
      snapshotStore.clearCache('doc-1');
      
      // Next call should query database again
      await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      expect(prisma.snapshot.findFirst).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveSnapshot', () => {
    it('should create a new snapshot', async () => {
      const snapshotData = {
        id: 'snapshot-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        data: JSON.stringify({ content: 'Test content', version: 10 }),
        version: 10,
        timestamp: Date.now(),
        metadata: {
          version: 10,
          documentId: 'doc-1',
          timestamp: Date.now(),
          eventCount: 5
        }
      };

      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(null));

      await snapshotStore.saveSnapshot(snapshotData);

      expect(prisma.snapshot.create).toHaveBeenCalledWith({
        data: snapshotData
      });
    });
  });

  describe('getSnapshotByVersion', () => {
    it('should return a snapshot by version', async () => {
      const mockSnapshot = {
        id: 'snapshot-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        data: JSON.stringify({ content: 'Test content', version: 10 }),
        version: 10,
        timestamp: Date.now(),
        metadata: {
          version: 10,
          documentId: 'doc-1',
          timestamp: Date.now(),
          eventCount: 5
        }
      };

      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(mockSnapshot));

      const result = await snapshotStore.getSnapshotByVersion('doc-1', '10', 'test-tenant');
      expect(result).toEqual(mockSnapshot);
    });
  });

  describe('shouldCreateSnapshot', () => {
    it('should return true if event count exceeds threshold and no recent snapshot', async () => {
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(null));
      prisma.event.count.mockImplementation(() => Promise.resolve(101)); // Above threshold

      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1', 'tenant-1');
      expect(shouldCreate).toBe(true);
    });

    it('should return false if event count is below threshold', async () => {
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve({
        id: 'snapshot-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 10,
        timestamp: Date.now() - 60000, // 1 minute ago
        data: '{}',
        metadata: {
          version: 10,
          documentId: 'doc-1',
          timestamp: Date.now(),
          eventCount: 5
        }
      }));
      
      prisma.event.count.mockImplementation(() => Promise.resolve(10)); // Below threshold

      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1', 'tenant-1');
      expect(shouldCreate).toBe(false);
    });

    it('should return false if event count is below threshold with no recent snapshot', async () => {
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve(null));
      prisma.event.count.mockImplementation(() => Promise.resolve(10)); // Below threshold

      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1', 'tenant-1');
      expect(shouldCreate).toBe(false);
    });

    it('should return false if last snapshot is recent', async () => {
      prisma.snapshot.findFirst.mockImplementation(() => Promise.resolve({
        id: 'snapshot-1',
        documentId: 'doc-1',
        tenantId: 'tenant-1',
        version: 10,
        timestamp: Date.now() - 60000, // 1 minute ago
        data: '{}',
        metadata: {
          version: 10,
          documentId: 'doc-1',
          timestamp: Date.now(),
          eventCount: 5
        }
      }));
      
      prisma.event.count.mockImplementation(() => Promise.resolve(10)); // Below threshold

      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1', 'tenant-1');
      expect(shouldCreate).toBe(false);
    });
  });

  describe('pruneSnapshots', () => {
    it('should delete old snapshots beyond the retention limit', async () => {
      const mockSnapshots = [
        { id: 'snapshot-1', version: 10, timestamp: Date.now() - 1000000 },
        { id: 'snapshot-2', version: 9, timestamp: Date.now() - 2000000 },
        { id: 'snapshot-3', version: 8, timestamp: Date.now() - 3000000 },
        { id: 'snapshot-4', version: 7, timestamp: Date.now() - 4000000 },
        { id: 'snapshot-5', version: 6, timestamp: Date.now() - 5000000 },
        { id: 'snapshot-6', version: 5, timestamp: Date.now() - 6000000 },
        { id: 'snapshot-7', version: 4, timestamp: Date.now() - 7000000 },
      ];

      prisma.snapshot.findMany.mockImplementation(() => Promise.resolve(mockSnapshots));
      prisma.snapshot.deleteMany.mockImplementation(() => Promise.resolve({ count: 5 }));

      await snapshotStore.pruneSnapshots('doc-1', 'tenant-1', 2);

      expect(prisma.snapshot.findMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'tenant-1'
        },
        orderBy: {
          version: 'desc'
        }
      });

      expect(prisma.snapshot.deleteMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'tenant-1',
          id: {
            in: ['snapshot-3', 'snapshot-4', 'snapshot-5', 'snapshot-6', 'snapshot-7']
          }
        }
      });
    });
  });

  describe('pruneSnapshotsByAge', () => {
    it('should delete snapshots older than the specified age', async () => {
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days ago
      const mockSnapshots = [
        { id: 'snapshot-1', version: 10, timestamp: Date.now() - 1000000 },
        { id: 'snapshot-2', version: 9, timestamp: Date.now() - 2000000 },
        { id: 'snapshot-3', version: 8, timestamp: cutoffTime - 1000 },
        { id: 'snapshot-4', version: 7, timestamp: cutoffTime - 5000000 },
        { id: 'snapshot-5', version: 6, timestamp: cutoffTime - 10000000 },
      ];

      prisma.snapshot.findMany.mockImplementation(() => Promise.resolve(mockSnapshots));
      prisma.snapshot.deleteMany.mockImplementation(() => Promise.resolve({ count: 3 }));

      await snapshotStore.pruneSnapshotsByAge('doc-1', 'tenant-1', 30);

      expect(prisma.snapshot.findMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'tenant-1'
        }
      });

      expect(prisma.snapshot.deleteMany).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'tenant-1',
          id: {
            in: ['snapshot-3', 'snapshot-4', 'snapshot-5']
          }
        }
      });
    });
  });
});