import { SnapshotStore, Snapshot } from '../../../src/collaboration/snapshots/SnapshotStore';
import { MetricsCollector } from '../../../src/metrics/collector';
import { PrismaClient } from '@prisma/client';

// Mock Prisma and metrics collector
jest.mock('@prisma/client');
jest.mock('../../../src/metrics/collector');

// Mock tenant context
jest.mock('../../../src/lib/tenant-context', () => ({
  getTenantContext: jest.fn().mockReturnValue({ 
    tenantId: 'test-tenant',
    userId: 'test-user' 
  })
}));

describe('SnapshotStore', () => {
  let snapshotStore: SnapshotStore;
  let prisma: jest.Mocked<PrismaClient>;
  let metricsCollector: jest.Mocked<MetricsCollector>;
  
  beforeEach(() => {
    // Set up mocks
    prisma = {
      snapshot: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn()
      },
      event: {
        count: jest.fn()
      }
    } as unknown as jest.Mocked<PrismaClient>;
    
    // Add mockResolvedValue methods to the functions
    prisma.snapshot.create.mockResolvedValue({} as any);
    prisma.snapshot.findFirst.mockResolvedValue(null);
    prisma.snapshot.findMany.mockResolvedValue([]);
    prisma.snapshot.deleteMany.mockResolvedValue({ count: 0 });
    prisma.event.count.mockResolvedValue(0);
    
    metricsCollector = {
      recordLatency: jest.fn().mockResolvedValue(undefined),
      track: jest.fn().mockResolvedValue(undefined),
      increment: jest.fn().mockResolvedValue(undefined),
      incrementCounter: jest.fn().mockResolvedValue(undefined),
      decrementCounter: jest.fn().mockResolvedValue(undefined),
      getCounter: jest.fn().mockResolvedValue(0),
      formatKey: jest.fn().mockReturnValue('test-key')
    } as unknown as jest.Mocked<MetricsCollector>;
    
    // Create SnapshotStore instance
    snapshotStore = new SnapshotStore(prisma, metricsCollector);
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
      prisma.snapshot.create.mockResolvedValue(mockSnapshot);
      
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
          create: jest.fn().mockResolvedValue({
            id: 'snap-tx-1',
            version: 5
          })
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
    test('should return the latest snapshot for a document', async () => {
      // Mock snapshot
      const mockSnapshot: Snapshot = {
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: { content: 'test content' },
        version: 10,
        timestamp: new Date().toISOString(),
        data: {},
        metadata: {
          version: 10,
          documentId: 'doc-1',
          timestamp: new Date().toISOString(),
          eventCount: 50
        }
      };
      
      prisma.snapshot.findFirst.mockResolvedValue(mockSnapshot);
      
      // Get latest snapshot
      const result = await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      
      // Verify correct query parameters
      expect(prisma.snapshot.findFirst).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'test-tenant'
        },
        orderBy: {
          version: 'desc'
        }
      });
      
      // Verify result matches mock
      expect(result).toEqual(mockSnapshot);
      
      // Verify metrics were recorded
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.retrieved',
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          found: true
        })
      );
    });
    
    test('should return null when no snapshot exists', async () => {
      prisma.snapshot.findFirst.mockResolvedValue(null);
      
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
        timestamp: new Date().toISOString(),
        data: {},
        metadata: {}
      };
      
      prisma.snapshot.findFirst.mockResolvedValue(mockSnapshot);
      
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
        timestamp: new Date().toISOString(),
        data: {},
        metadata: {}
      };
      
      prisma.snapshot.findFirst.mockResolvedValue(mockSnapshot);
      
      // First call to populate cache
      await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      
      // Clear cache
      snapshotStore.clearCache('doc-1');
      
      // Next call should query database again
      await snapshotStore.getLatestSnapshot('doc-1', 'tenant-1');
      expect(prisma.snapshot.findFirst).toHaveBeenCalledTimes(2);
    });
  });
  
  describe('getSnapshotAtVersion', () => {
    test('should return snapshot at or before specified version', async () => {
      // Mock snapshot
      const mockSnapshot: Snapshot = {
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: { content: 'test content' },
        version: 8,
        timestamp: new Date().toISOString(),
        data: {},
        metadata: {
          version: 8,
          documentId: 'doc-1',
          timestamp: new Date().toISOString(),
          eventCount: 20
        }
      };
      
      prisma.snapshot.findFirst.mockResolvedValue(mockSnapshot);
      
      // Get snapshot at version 10
      const result = await snapshotStore.getSnapshotByVersion('doc-1', '10', 'test-tenant');
      
      // Verify query parameters
      expect(prisma.snapshot.findFirst).toHaveBeenCalledWith({
        where: {
          documentId: 'doc-1',
          tenantId: 'test-tenant',
          version: {
            lte: 10
          }
        },
        orderBy: {
          version: 'desc'
        }
      });
      
      // Verify result
      expect(result).toEqual(mockSnapshot);
    });
  });
  
  describe('shouldCreateSnapshot', () => {
    test('should recommend snapshot when event count threshold is exceeded', async () => {
      // Mock no existing snapshot
      prisma.snapshot.findFirst.mockResolvedValue(null);
      
      // Mock event count
      prisma.event.count.mockResolvedValue(101); // Above threshold
      
      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1');
      
      expect(shouldCreate).toBe(true);
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.decision',
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          reason: 'event_count'
        })
      );
    });
    
    test('should recommend snapshot when time threshold is exceeded', async () => {
      // Mock existing old snapshot
      const oldTimestamp = Date.now() - (1000 * 60 * 60 * 2); // 2 hours ago
      prisma.snapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: {},
        version: 5,
        timestamp: oldTimestamp
      });
      
      // Mock low event count
      prisma.event.count.mockResolvedValue(10); // Below threshold
      
      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1');
      
      expect(shouldCreate).toBe(true);
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.decision',
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          reason: 'time_threshold'
        })
      );
    });
    
    test('should recommend snapshot for first-time documents', async () => {
      // Mock no existing snapshot
      prisma.snapshot.findFirst.mockResolvedValue(null);
      
      // Mock low event count
      prisma.event.count.mockResolvedValue(10); // Below threshold
      
      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1');
      
      expect(shouldCreate).toBe(true);
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.decision',
        1,
        expect.objectContaining({
          documentId: 'doc-1',
          reason: 'first_snapshot'
        })
      );
    });
    
    test('should not recommend snapshot when thresholds are not met', async () => {
      // Mock recent snapshot
      prisma.snapshot.findFirst.mockResolvedValue({
        id: 'snap-1',
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: {},
        version: 50,
        timestamp: Date.now() - (1000 * 60 * 5) // 5 minutes ago
      });
      
      // Mock low event count
      prisma.event.count.mockResolvedValue(10); // Below threshold
      
      const shouldCreate = await snapshotStore.shouldCreateSnapshot('doc-1');
      
      expect(shouldCreate).toBe(false);
    });
  });
  
  describe('purgeOldSnapshots', () => {
    test('should delete old snapshots keeping only latest N', async () => {
      // Mock snapshots
      const mockSnapshots = Array.from({ length: 10 }, (_, i) => ({
        id: `snap-${i + 1}`,
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: { content: `content ${i + 1}` },
        version: 100 - i, // Descending versions
        timestamp: Date.now() - (i * 1000)
      }));
      
      prisma.snapshot.findMany.mockResolvedValue(mockSnapshots);
      prisma.snapshot.deleteMany.mockResolvedValue({ count: 5 });
      
      // Keep 5 latest snapshots
      const deleteCount = await snapshotStore.purgeOldSnapshots('doc-1', 5);
      
      // Should delete 5 snapshots
      expect(deleteCount).toBe(5);
      
      // Verify deletion query
      expect(prisma.snapshot.deleteMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: mockSnapshots.slice(5).map(s => s.id)
          }
        }
      });
      
      // Verify metrics
      expect(metricsCollector.track).toHaveBeenCalledWith(
        'snapshot.purged',
        5,
        expect.objectContaining({
          documentId: 'doc-1',
          keepCount: 5
        })
      );
    });
    
    test('should do nothing when fewer snapshots exist than keepCount', async () => {
      // Mock only 3 snapshots
      const mockSnapshots = Array.from({ length: 3 }, (_, i) => ({
        id: `snap-${i + 1}`,
        documentId: 'doc-1',
        tenantId: 'test-tenant',
        state: { content: `content ${i + 1}` },
        version: 100 - i,
        timestamp: Date.now() - (i * 1000)
      }));
      
      prisma.snapshot.findMany.mockResolvedValue(mockSnapshots);
      
      // Try to keep 5 latest snapshots
      const deleteCount = await snapshotStore.purgeOldSnapshots('doc-1', 5);
      
      // Should delete 0 snapshots
      expect(deleteCount).toBe(0);
      
      // Verify no deletion occurred
      expect(prisma.snapshot.deleteMany).not.toHaveBeenCalled();
    });
  });
});

// Update the mock snapshot with proper metadata
const mockSnapshot = {
  id: 'snap-1',
  documentId: 'doc-1',
  tenantId: 'test-tenant',
  state: { content: 'test content' },
  version: 8,
  timestamp: new Date().toISOString(),
  data: {},
  metadata: {
    version: 8,
    documentId: 'doc-1',
    timestamp: new Date().toISOString(),
    eventCount: 20
  }
};

// And update the method call to use string version parameter
const result = await snapshotStore.getSnapshotByVersion('doc-1', '10', 'test-tenant');